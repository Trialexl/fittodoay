package com.fittodoay.android

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/** Room owns durability; Flow combines keystrokes. Scope survives screen/ViewModel disposal. */
@OptIn(FlowPreview::class)
class LocalDrafts private constructor(context: Context, token: String) {
    private val app = context.applicationContext
    private val account = localAccountKey(token)
    private val db by lazy { WorkoutDatabase.get(app) }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    private val values = ConcurrentHashMap<String, String>()
    private data class Edit(val json: String)
    private val pending = ConcurrentHashMap<String, Edit>()
    private val requests = MutableSharedFlow<Unit>(replay = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val failure = MutableStateFlow<String?>(null)
    val error = failure.asStateFlow()
    private val loaded = scope.async {
        val legacy = LocalDataStore(app, token)
        db.runInTransaction {
            val dao = db.drafts()
            val existing = dao.all(account)
            if (existing.none { it.key == "local:drafts-imported" }) {
                val keys = legacy.paths("local:chat-draft:") + "local:assistant-answers"
                dao.put(keys.distinct().filter { key -> existing.none { it.key == key } }.mapNotNull { key ->
                    legacy.read(key)?.let { StoredLocalDraft(account, key, it.toString()) }
                } + StoredLocalDraft(account, "local:drafts-imported", "{}"))
            }
            dao.all(account).forEach { values.putIfAbsent(it.key, it.json) }
        }
    }
    init { scope.launch { requests.debounce(300).collect { persist() } } }
    suspend fun awaitReady() { loaded.await() }
    fun read(key: String): JSONObject? = values[key]?.let(::JSONObject)
    fun write(key: String, value: JSONObject) {
        val json = value.toString()
        if (values.put(key, json) == json) return
        pending[key] = Edit(json)
        requests.tryEmit(Unit)
    }
    private suspend fun persist() = lock.withLock {
        try {
            loaded.await()
            val changes = pending.toMap()
            if (changes.isEmpty()) return@withLock
            db.drafts().put(changes.map { (key, value) -> StoredLocalDraft(account, key, value.json) })
            changes.forEach { (key, value) -> pending.remove(key, value) }
            failure.value = null
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { failure.value = "Не удалось сохранить черновик на устройстве. Освободите место и повторите." }
    }
    suspend fun flush() = withContext(Dispatchers.IO) { persist() }
    fun flushInBackground() { scope.launch { persist() } }
    companion object {
        private val instances = ConcurrentHashMap<String, LocalDrafts>()
        fun get(context: Context, token: String): LocalDrafts = instances.getOrPut(localAccountKey(token)) { LocalDrafts(context, token) }
    }
}
