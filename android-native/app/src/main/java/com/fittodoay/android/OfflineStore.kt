package com.fittodoay.android

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class OfflineStore(context: Context, token: String) {
    private val suffix = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }
    private val prefs = context.getSharedPreferences("offline-$suffix", Context.MODE_PRIVATE)
    fun plan(date: String): JSONObject? = prefs.getString("plan-$date", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    fun cache(date: String, plan: JSONObject) { check(prefs.edit().putString("plan-$date", plan.toString()).commit()) }
    fun queue(): List<JSONObject> = JSONArray(prefs.getString("queue", "[]")).objects()
    private fun write(items: List<JSONObject>) { check(prefs.edit().putString("queue", JSONArray(items).toString()).commit()) }
    fun enqueue(key: String, path: String, method: String, date: String, body: JSONObject, original: JSONObject? = null) {
        val previous = queue()
        val firstOriginal = previous.firstOrNull { it.text("key") == key }?.optJSONObject("original") ?: original
        write(previous.filter { it.text("key") != key } + obj("key" to key, "path" to path, "method" to method, "date" to date, "body" to body, "original" to firstOriginal))
    }
    fun remove(key: String) = write(queue().filter { it.text("key") != key })
}
