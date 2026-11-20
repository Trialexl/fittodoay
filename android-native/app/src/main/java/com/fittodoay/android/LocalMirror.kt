package com.fittodoay.android

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.LocalDate
import kotlin.coroutines.coroutineContext

/** Downloads existing readable data only. No music requests, chat creation, or AI generation. */
class LocalMirror(context: Context, token: String) {
    private val data = LocalDataStore(context, token)
    private val media = LocalMediaStore(context, token)
    private val remote = Api { token }
    suspend fun synchronize(progress: (String) -> Unit): JSONObject = withContext(Dispatchers.IO) {
        val failures = JSONArray()
        suspend fun fetch(path: String): Any? {
            coroutineContext.ensureActive()
            for (attempt in 0..2) {
            return try {
                val first = remote.all(path)
                first.also { data.write(path, it) }
            }
            catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                if (error is ApiException && error.status == 401) throw error
                if (isTransientLocalFailure(error) && attempt < 2) { kotlinx.coroutines.delay(500L * (attempt + 1)); continue }
                failures.put(obj("path" to path, "error" to (error.message ?: error.javaClass.simpleName)))
                if (isTransientLocalFailure(error) || error is LocalStorageException) throw error
                null
            }
            }
            error("Unreachable")
        }
        progress("Профиль, программы и каталог")
        for (path in listOf("/api/profile/", "/api/profile/preferences/", "/api/programs/folders/", "/api/programs/templates/",
            "/api/exercises/", "/api/exercises/custom/", "/api/workouts/logs/", "/api/technique-reviews/")) fetch(path)
        val end = LocalDate.now().plusDays(1).toString()
        progress("История тренировок и аналитика")
        for (path in listOf("/api/analytics/days/", "/api/analytics/body-weight/", "/api/analytics/exercises/")) {
            fetch("$path?start=1970-01-01&end=$end")?.let { data.write("local:all:$path", it) }
            fetch(path)
        }
        for (range in listOf("week", "month", "half-year", "year")) for (granularity in listOf("day", "week")) {
            fetch("/api/analytics/program-trends/?range=$range&granularity=$granularity")
        }
        val dates = (data.read("local:all:/api/analytics/days/")?.rows().orEmpty().filter { it.optDouble("load") > 0 }.map { it.text("date") } +
            LocalDate.now().toString()).distinct()
        for ((index, date) in dates.withIndex()) {
            progress("Планы тренировок: ${index + 1}/${dates.size}")
            fetch("/api/workouts/plan/?date=$date")
        }
        progress("Переписки и исходные видео")
        val threads = fetch("/api/llm-agent/threads/")
        if (threads != null) data.write("local:threads", threads)
        val known = data.paths("local:chat:").mapNotNull { data.read(it) as? JSONObject }
        val allThreads = (threads?.rows().orEmpty() + known).distinctBy { it.getInt("id") }
        for (thread in allThreads) fetch("/api/llm-agent/threads/${thread.getInt("id")}/messages/")
        for (review in data.read("/api/technique-reviews/")?.rows().orEmpty()) {
            coroutineContext.ensureActive()
            try { media.downloadReviewVideo(review) } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                failures.put(obj("resource" to "technique-video:${review.getInt("id")}", "error" to (error.message ?: "Ошибка загрузки видео")))
                if (isTransientLocalFailure(error) || error is LocalStorageException) throw error
            }
        }
        val templates = data.read("/api/programs/templates/")?.rows().orEmpty()
        val catalog = data.read("/api/exercises/")?.rows().orEmpty()
        for (exercise in catalog) data.write("/api/exercises/${java.net.URLEncoder.encode(exercise.text("id"), "UTF-8")}/", exercise)
        for (exercise in templates.flatMap { it.array("template_exercises") }.mapNotNull { it.optJSONObject("custom_exercise") }.distinctBy { it.text("id") }) {
            data.write("/api/exercises/custom/${exercise.getInt("id")}/", exercise)
        }
        val images = catalog.flatMap { it.array("images") }.map { exerciseImageUrl(it.text("path")) }.distinct()
        for ((index, image) in images.withIndex()) {
            coroutineContext.ensureActive()
            progress("Изображения упражнений: ${index + 1}/${images.size}")
            try { media.image(image) } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                failures.put(obj("resource" to URI(image).path, "error" to (error.message ?: "Ошибка загрузки")))
                if (isTransientLocalFailure(error) || error is LocalStorageException) throw error
            }
        }
        val result = obj("finished_at" to System.currentTimeMillis(), "complete" to (failures.length() == 0), "failures" to failures,
            "responses" to data.count(), "images" to images.size)
        data.write("local:sync", result)
        result
    }
}
