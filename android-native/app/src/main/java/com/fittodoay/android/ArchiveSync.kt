package com.fittodoay.android

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** WorkManager owns lifetime, connectivity, deduplication and retries of the full archive. */
object ArchiveSync {
    fun name(token: String) = "local-archive-${localAccountKey(token)}"
    suspend fun schedule(context: Context, token: String, force: Boolean = false) = withContext(kotlinx.coroutines.NonCancellable + Dispatchers.IO) {
        if (!force) {
            val last = LocalDataStore(context, token).read("local:sync") as? JSONObject
            if (last?.optBoolean("complete") == true && System.currentTimeMillis() - last.optLong("finished_at") < 15 * 60_000L) return@withContext
        }
        val request = OneTimeWorkRequestBuilder<ArchiveSyncWorker>()
            .setInputData(workDataOf("account" to localAccountKey(token)))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(if (force) 0 else 5, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(name(token), if (force) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, request).result.get(10, TimeUnit.SECONDS)
    }
    fun cancel(context: Context, token: String) { WorkManager.getInstance(context).cancelUniqueWork(name(token)) }
}

class ArchiveSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val token = withContext(Dispatchers.IO) { SessionStore(applicationContext).read() }
        if (token.isEmpty() || inputData.getString("account") != localAccountKey(token)) return Result.success()
        return try {
            val result = LocalMirror(applicationContext, token).synchronize(
                accountActive = { SessionStore(applicationContext).read() == token },
                progress = { setProgress(workDataOf("stage" to it)) })
            Result.success(workDataOf("stage" to if (result.optBoolean("complete")) "Локальная копия обновлена" else "Сохранены доступные данные"))
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) {
            val message = if (e is LocalStorageException) e.message.orEmpty() else "Локальная копия не завершена. Уже сохранённые данные доступны без сети."
            withContext(Dispatchers.IO) {
                LocalDataStore(applicationContext, token).write("local:sync", obj("finished_at" to System.currentTimeMillis(), "complete" to false,
                    "failures" to org.json.JSONArray().put(obj("error" to message))))
            }
            if (isTransientLocalFailure(e)) Result.retry() else Result.failure(workDataOf("stage" to message))
        }
    }
}
