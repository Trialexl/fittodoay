package com.fittodoay.android

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

data class WorkoutSyncState(val pending: Int = 0, val syncing: Boolean = false, val error: String? = null, val blocked: Boolean = false)
data class WorkoutSnapshot(val date: String, val plan: JSONObject, val revision: Long)

/** Local data is authoritative. Both the ViewModel and WorkManager use the same serialized outbox. */
class WorkoutRepository private constructor(private val context: Context, private val token: String, private val baseUrl: String, transport: okhttp3.OkHttpClient?) {
    private val store by lazy { OfflineStore(context, token) }
    private val local = Mutex()
    private val sending = Mutex()
    private val revisions = ConcurrentHashMap<String, Long>()
    private val mutableState = MutableStateFlow(WorkoutSyncState())
    val state = mutableState.asStateFlow()
    private val mutableSnapshot = MutableStateFlow<WorkoutSnapshot?>(null)
    val snapshot = mutableSnapshot.asStateFlow()
    fun observePending() = flow { emitAll(store.observePending()) }.flowOn(Dispatchers.IO)
    fun observeHistory(start: String, end: String) = flow { emitAll(store.observeHistory(start, end)) }.flowOn(Dispatchers.IO)
    private val remote = Api(baseUrl = baseUrl, transportOverride = transport) { token }
    fun revision(date: String) = revisions[date] ?: 0L
    suspend fun initialize() = withContext(Dispatchers.IO) { local.withLock {
        publish()
    } }
    suspend fun read(date: String): JSONObject? = withContext(Dispatchers.IO) { local.withLock { store.plan(date)?.let { withQueuedChanges(it, store.queue(), date) } } }
    private fun publish(error: String? = null, blocked: Boolean = false) {
        val pending = store.queue().size
        mutableState.update { it.copy(pending = pending, error = error, blocked = blocked) }
    }
    private fun commit(date: String, plan: JSONObject, persist: Boolean = true, asOf: Long = System.currentTimeMillis()): WorkoutSnapshot {
        if (persist) store.cache(date, plan, asOf)
        val snapshot = WorkoutSnapshot(date, plan, revision(date) + 1)
        revisions[date] = snapshot.revision
        mutableSnapshot.value = snapshot
        publish()
        return snapshot
    }
    suspend fun stage(key: String, path: String, method: String, date: String, body: JSONObject, original: JSONObject?, basePlan: JSONObject): WorkoutSnapshot = withContext(Dispatchers.IO) {
        local.withLock {
            val projected = store.stage(key, path, method, date, body, original, store.plan(date) ?: basePlan)
            val result = commit(date, projected, persist = false)
            schedule()
            result
        }
    }
    suspend fun undo(log: JSONObject, date: String, basePlan: JSONObject): WorkoutSnapshot = withContext(Dispatchers.IO) {
        local.withLock {
            val key = log.text("queue_key").ifBlank { "set:${log.optInt("workout_day")}:${log.optInt("template_exercise")}:${log.optInt("set_index")}" }
            val pending = store.queue().firstOrNull { it.text("key") == key }
            val original = if (log.optBoolean("queued")) pending?.optJSONObject("original") else log
            val plan = store.plan(date) ?: basePlan
            if (original == null && pending?.optBoolean("attempted") != true) {
                commit(date, store.cancel(key, date, plan), persist = false)
            } else {
                val body = pending?.getJSONObject("body") ?: log
                val path = "/api/workouts/logs/" + (original?.optInt("id")?.takeIf { it > 0 }?.let { "$it/" } ?: "")
                val result = commit(date, store.stage(key, path, "DELETE", date, body, original, plan), persist = false)
                schedule(); result
            }
        }
    }
    suspend fun acceptRemote(date: String, expectedRevision: Long, plan: JSONObject, asOf: Long = System.currentTimeMillis()): WorkoutSnapshot? = withContext(Dispatchers.IO) {
        local.withLock {
            if (revision(date) != expectedRevision) null
            else {
                val queue = store.queue()
                commit(date, withQueuedChanges(plan, queue, date), asOf = if (queue.any { it.text("date") == date }) System.currentTimeMillis() else asOf)
            }
        }
    }
    /** No cached GET fallback when resolving an uncertain POST or DELETE. */
    private suspend fun send(entry: JSONObject): JSONObject {
        val body = entry.getJSONObject("body")
        var path = entry.getString("path"); var method = entry.getString("method")
        if (path.startsWith("/api/workouts/logs/")) {
            if (method == "POST" && entry.optBoolean("attempted") || method == "DELETE" && path == "/api/workouts/logs/") {
                val current = normalizePlan(remote.call("/api/workouts/plan/?date=${entry.text("date")}") as JSONObject)
                val existing = current.array("logs").find { it.optInt("template_exercise") == body.optInt("template_exercise") && it.optInt("set_index") == body.optInt("set_index") }
                if (existing != null) { path = "/api/workouts/logs/${existing.getInt("id")}/"; if (method == "POST") method = "PATCH" }
                else if (method == "DELETE") return JSONObject()
            }
        }
        return try { remote.call(path, method, body) as JSONObject }
        catch (error: ApiException) {
            if (method == "DELETE" && error.status == 404) JSONObject()
            else if (method == "POST" && error.status == 400 && path == "/api/workouts/logs/") {
                val current = normalizePlan(remote.call("/api/workouts/plan/?date=${entry.text("date")}") as JSONObject)
                val existing = current.array("logs").find { it.optInt("template_exercise") == body.optInt("template_exercise") && it.optInt("set_index") == body.optInt("set_index") } ?: throw error
                remote.call("/api/workouts/logs/${existing.getInt("id")}/", "PATCH", body) as JSONObject
            } else throw error
        }
    }
    suspend fun synchronize(accountActive: () -> Boolean) = sending.withLock {
        withContext(Dispatchers.IO) {
            mutableState.update { it.copy(syncing = true, error = null, blocked = false) }
            try {
                while (accountActive()) {
                    val entry = local.withLock {
                        store.queue().firstOrNull()?.also { store.markAttempt(it) }
                    } ?: break
                    val result = send(entry)
                    local.withLock {
                        store.accept(entry, result)?.let { accepted ->
                            val date = entry.text("date")
                            commit(date, accepted, persist = false)
                        }
                    }
                }
            } catch (error: IOException) {
                val blocked = error is ApiException && error.status in 400..499 && error.status !in listOf(408, 429)
                publish(if (blocked) error.message else "Изменения сохранены на устройстве. Отправим их при восстановлении соединения.", blocked)
                throw error
            } finally { mutableState.update { it.copy(syncing = false) } }
        }
    }
    fun schedule() {
        // Injected test transports must never schedule production network work.
        if (baseUrl != BuildConfig.SERVER_URL) return
        val request = OneTimeWorkRequestBuilder<WorkoutSyncWorker>()
            .setInputData(workDataOf("account" to localAccountKey(token)))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(3, TimeUnit.SECONDS).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork("workout-outbox-${localAccountKey(token)}", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
    companion object {
        private val instances = ConcurrentHashMap<String, WorkoutRepository>()
        fun get(context: Context, token: String, baseUrl: String = BuildConfig.SERVER_URL, transport: okhttp3.OkHttpClient? = null): WorkoutRepository =
            instances.getOrPut("$baseUrl:${localAccountKey(token)}") { WorkoutRepository(context.applicationContext, token, baseUrl, transport) }
    }
}

class WorkoutSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val token = SessionStore(applicationContext).read()
        if (token.isEmpty() || localAccountKey(token) != inputData.getString("account")) return Result.success()
        val repository = WorkoutRepository.get(applicationContext, token)
        return try {
            repository.synchronize { SessionStore(applicationContext).read() == token }; Result.success()
        } catch (error: IOException) {
            if (repository.state.value.blocked) Result.failure() else Result.retry()
        }
    }
}
