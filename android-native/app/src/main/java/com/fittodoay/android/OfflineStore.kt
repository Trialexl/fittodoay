package com.fittodoay.android

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Compatibility adapter. Room owns transactions, durability, threading checks and change notifications. */
class OfflineStore(context: Context, token: String) {
    private val account = localAccountKey(token)
    private val db = WorkoutDatabase.get(context)
    private val dao = db.workouts()
    init {
        // Import the shipped preferences format once; retain the original as a recovery copy.
        db.runInTransaction {
            if (!dao.imported(account)) {
                val legacy = context.getSharedPreferences("offline-$account", Context.MODE_PRIVATE)
                legacy.all.forEach { (key, value) ->
                    if (key.startsWith("plan-") && value is String) dao.cache(StoredWorkoutPlan(account, key.removePrefix("plan-"), value))
                }
                JSONArray(legacy.getString("queue", "[]")).objects().forEachIndexed { index, entry ->
                    dao.put(StoredWorkoutWrite(account, entry.getString("key"), index.toLong(), entry.toString()))
                }
                dao.imported(ImportedWorkoutAccount(account))
            }
        }
    }
    fun plan(date: String): JSONObject? = dao.plan(account, date)?.let(::JSONObject)
    fun cache(date: String, plan: JSONObject, asOf: Long = System.currentTimeMillis()) = dao.cache(StoredWorkoutPlan(account, date, plan.toString(), asOf))
    fun observeHistory(start: String, end: String): Flow<LocalWorkoutHistory> = dao.observePlans(account, start, end).map {
        db.runInTransaction(java.util.concurrent.Callable {
            LocalWorkoutHistory(dao.plans(account, start, end).associate { row -> row.date to LocalWorkoutDay(normalizePlan(JSONObject(row.json)), row.updatedAt) },
                queue().filter { entry -> entry.text("path").startsWith("/api/workouts/logs/") }.map { entry -> entry.text("date") }.toSet())
        })
    }.flowOn(Dispatchers.IO)
    fun queue(): List<JSONObject> = dao.queue(account).map { JSONObject(it.json) }
    fun observePending(): Flow<Int> = dao.observePending(account)
    private fun put(entry: JSONObject) {
        val current = dao.queue(account)
        val position = current.firstOrNull { it.key == entry.text("key") }?.position ?: ((current.maxOfOrNull { it.position } ?: -1) + 1)
        dao.put(StoredWorkoutWrite(account, entry.getString("key"), position, entry.toString()))
    }
    private fun mutation(key: String, path: String, method: String, date: String, body: JSONObject, original: JSONObject?): JSONObject {
        val old = queue().firstOrNull { it.text("key") == key }
        return obj("key" to key, "path" to path, "method" to method, "date" to date, "body" to body,
            "original" to (old?.optJSONObject("original") ?: original), "version" to UUID.randomUUID().toString(), "attempted" to (old?.optBoolean("attempted") == true))
    }
    fun enqueue(key: String, path: String, method: String, date: String, body: JSONObject, original: JSONObject? = null) = db.runInTransaction {
        put(mutation(key, path, method, date, body, original))
    }
    fun remove(key: String) = dao.remove(account, key)
    fun markAttempt(entry: JSONObject) = db.runInTransaction {
        queue().firstOrNull { it.text("key") == entry.text("key") && it.text("version") == entry.text("version") }?.let { put(it.put("attempted", true)) }
    }
    fun stage(key: String, path: String, method: String, date: String, body: JSONObject, original: JSONObject?, base: JSONObject): JSONObject = db.runInTransaction(java.util.concurrent.Callable {
        put(mutation(key, path, method, date, body, original))
        withQueuedChanges(base, queue(), date).also { cache(date, it) }
    })
    fun accept(entry: JSONObject, result: JSONObject): JSONObject? = db.runInTransaction(java.util.concurrent.Callable {
        val current = queue().firstOrNull { it.text("key") == entry.text("key") } ?: return@Callable null
        if (current.text("version") != entry.text("version")) return@Callable null
        val date = entry.text("date")
        remove(entry.text("key"))
        withQueuedChanges(withSyncedChange(plan(date) ?: obj("date" to date), entry, result), queue(), date).also { cache(date, it) }
    })
    fun cancel(key: String, date: String, base: JSONObject): JSONObject = db.runInTransaction(java.util.concurrent.Callable {
        remove(key)
        val restored = JSONObject(base.toString()).put("logs", JSONArray(base.array("logs").filterNot { it.text("queue_key") == key }))
        withQueuedChanges(restored, queue(), date).also { cache(date, it) }
    })
}
