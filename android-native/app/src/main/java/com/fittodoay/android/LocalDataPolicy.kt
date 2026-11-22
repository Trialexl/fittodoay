package com.fittodoay.android

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLDecoder

class LocalDataUnavailableException : java.io.IOException("Данные ещё не сохранены на устройстве. Подключитесь к интернету для первой загрузки.")

/** Authentication and music are never written to the application data mirror. */
fun isLocalDataPath(path: String): Boolean = path.startsWith("/api/") &&
    !path.startsWith("/api/auth/") && !path.startsWith("/api/workouts/music/")

fun isTransientLocalFailure(error: Exception): Boolean = error is java.io.IOException &&
    (error !is ApiException || error.status in listOf(408, 429) || error.status >= 500)

interface ResponseStorage {
    fun read(path: String): Any?
    fun write(path: String, value: Any)
    fun writeSnapshot(path: String, value: Any, asOf: Long) { write(path, value) }
    fun remove(path: String)
    fun recordMutation(path: String, method: String, body: JSONObject?, result: Any)
}

data class StoredResponse(val value: Any, val asOf: Long)

fun parseStoredJson(value: String): Any = if (value.trimStart().startsWith("[")) JSONArray(value) else JSONObject(value)

/** Derive query results from the complete local collections, not only previously opened searches. */
fun localQuery(path: String, read: (String) -> Any?): Any? {
    val route = path.substringBefore('?')
    val params = path.substringAfter('?', "").split('&').filter { it.isNotBlank() }.associate {
        URLDecoder.decode(it.substringBefore('='), "UTF-8") to URLDecoder.decode(it.substringAfter('=', ""), "UTF-8")
    }
    if (route == "/api/exercises/" && params.keys.all { it in setOf("q", "limit", "offset") }) {
        val all = read(route) ?: return null
        val words = params["q"].orEmpty().lowercase().replace('ё', 'е').split(Regex("\\s+")).filter { it.isNotBlank() }
        val matched = all.rows().filter { item ->
            val text = listOf("name", "english_name", "target_muscles", "description").joinToString(" ") { item.text(it) }.lowercase().replace('ё', 'е')
            words.all { text.contains(it) }
        }.drop(params["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0)
        return JSONArray(params["limit"]?.toIntOrNull()?.let { matched.take(it.coerceAtLeast(0)) } ?: matched)
    }
    if (route == "/api/programs/templates/" && params.keys == setOf("folder")) {
        return read(route)?.let { JSONArray(it.rows().filter { item -> item.text("folder") == params["folder"] }) }
    }
    if (route in setOf("/api/analytics/days/", "/api/analytics/body-weight/") && params.isNotEmpty() && params.keys.all { it in setOf("start", "end") }) {
        val all = read("local:all:$route") ?: return null
        return obj("items" to JSONArray(all.rows().filter {
            val date = it.text("date")
            (params["start"] == null || date >= params.getValue("start")) && (params["end"] == null || date <= params.getValue("end"))
        }))
    }
    if (route.startsWith("/api/exercises/") && route != "/api/exercises/" && route != "/api/exercises/custom/") {
        val custom = route.startsWith("/api/exercises/custom/")
        val id = URLDecoder.decode(route.trimEnd('/').substringAfterLast('/'), "UTF-8")
        return read(if (custom) "/api/exercises/custom/" else "/api/exercises/")?.rows()?.firstOrNull { it.text("id") == id }
    }
    return null
}
