package com.fittodoay.android

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.URI
import java.util.UUID
import java.util.concurrent.TimeUnit

class LocalStorageException(message: String) : IllegalStateException(message)

fun exerciseImageUrl(path: String): String = if (path.startsWith("https://")) path else BuildConfig.SERVER_URL + "/static/" +
    path.trimStart('/').removePrefix("static/").split('/').joinToString("/") { java.net.URLEncoder.encode(it, "UTF-8").replace("+", "%20") }

/** Files live in filesDir, with no cache eviction. Music is explicitly rejected. */
class LocalMediaStore internal constructor(context: Context, private val token: String,
    private val baseUrl: String = BuildConfig.SERVER_URL, private val transport: OkHttpClient = client) {
    private val directory = File(context.filesDir, "local-media/${localAccountKey(token)}").apply { mkdirs() }
    private val data = LocalDataStore(context, token)
    fun existing(key: String): File? = data.read("local:media:$key")?.let { entry ->
        File(directory, (entry as JSONObject).text("file")).takeIf { it.isFile && it.length() == entry.optLong("bytes") }
    }
    fun preserveVideo(key: String, source: File, mime: String): File {
        require(mime.startsWith("video/")) { "Музыка не сохраняется в локальном хранилище" }
        ensureSpace(source.length())
        return write(key, "video", source.name) { output -> source.inputStream().use { it.copyTo(output) } }
    }
    suspend fun image(url: String): File = withContext(Dispatchers.IO) {
        existing(url)?.let { return@withContext it }
        val target = URI(url)
        require(target.scheme == "https" && !url.contains("/music/"))
        val server = URI(BuildConfig.SERVER_URL)
        val request = Request.Builder().url(url).apply {
            if (target.host == server.host && target.port == server.port) header("Authorization", "Token $token")
        }.build()
        repeat(3) { attempt ->
            try {
                return@withContext client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw ApiException(response.code, "Не удалось сохранить изображение (${response.code})")
                    val body = response.body ?: throw IOException("Пустое изображение")
                    if (body.contentType()?.type != "image") throw ApiException(422, "Ожидалось изображение упражнения")
                    ensureSpace(body.contentLength().coerceAtLeast(0))
                    write(url, "image", target.path.substringAfterLast('/')) { output -> body.byteStream().use { it.copyTo(output) } }
                }
            } catch (error: Exception) {
                if (!isTransientLocalFailure(error) || attempt == 2) throw error
                kotlinx.coroutines.delay(500L * (attempt + 1))
            }
        }
        error("Unreachable")
    }
    fun reviewVideo(reviewId: Int): File? {
        val record = data.read("local:video:$reviewId") as? JSONObject ?: return null
        return existing(record.text("media_key"))
    }
    suspend fun downloadReviewVideo(review: JSONObject): File = withContext(Dispatchers.IO) {
        val id = review.getInt("id")
        reviewVideo(id)?.let { return@withContext it }
        val path = review.text("video_url")
        require(path == "/api/technique-reviews/$id/video/") { "Сервер не предоставил адрес исходного видео" }
        val key = "review-video:$id"
        require(URI(baseUrl).scheme == "https")
        val request = Request.Builder().url(baseUrl.trimEnd('/') + path).header("Authorization", "Token $token").build()
        val file = existing(key) ?: transport.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw ApiException(response.code, "Не удалось сохранить видео (${response.code})")
            val body = response.body ?: throw IOException("Пустое видео")
            require(body.contentType()?.type == "video") { "Сервер вернул неверный формат видео" }
            ensureSpace(body.contentLength().coerceAtLeast(0))
            write(key, "video", review.text("video_filename")) { output -> body.byteStream().use { it.copyTo(output) } }
        }
        data.write("local:video:$id", obj("file" to file.name, "media_key" to key, "name" to review.text("video_filename"), "review" to review))
        file
    }
    private fun ensureSpace(bytes: Long) {
        if (bytes > directory.usableSpace - 10 * 1024 * 1024) throw LocalStorageException("Недостаточно места на устройстве. Уже сохранённые данные не удалены.")
    }
    private fun write(key: String, kind: String, name: String, copy: (java.io.OutputStream) -> Unit): File {
        val file = File(directory, localAccountKey(key) + if (kind == "video") ".video" else ".image")
        val partial = File(directory, ".${UUID.randomUUID()}.part")
        try {
            ensureSpace(0)
            partial.outputStream().use { output ->
                var unchecked = 0L
                val guarded = object : java.io.FilterOutputStream(output) {
                    override fun write(value: Int) { if (++unchecked >= 1024 * 1024) { ensureSpace(1); unchecked = 0 }; out.write(value) }
                    override fun write(bytes: ByteArray, offset: Int, length: Int) {
                        unchecked += length
                        if (unchecked >= 1024 * 1024) { ensureSpace(length.toLong()); unchecked = 0 }
                        out.write(bytes, offset, length)
                    }
                }
                copy(guarded); output.fd.sync()
            }
            if (!partial.renameTo(file)) throw IOException("Не удалось сохранить файл на устройстве")
            data.write("local:media:$key", obj("file" to file.name, "kind" to kind, "name" to name, "bytes" to file.length()))
            return file
        } finally { partial.delete() }
    }
    fun statistics(): Pair<Int, Long> {
        val files = directory.listFiles()?.filter { it.isFile && !it.name.endsWith(".part") }.orEmpty()
        return files.size to files.sumOf { it.length() }
    }
    fun removeReviewVideo(reviewId: Int) {
        val record = data.read("local:video:$reviewId") as? JSONObject ?: return
        val name = record.text("file")
        require(name.matches(Regex("[0-9a-f]{64}\\.video"))) { "Некорректная ссылка на локальное видео" }
        val file = File(directory, name)
        if (file.exists() && !file.delete()) throw LocalStorageException("Не удалось удалить видео с устройства")
        val key = record.text("media_key")
        if (key.isNotBlank()) data.remove("local:media:$key")
        else for (path in data.paths("local:media:")) {
            if ((data.read(path) as? JSONObject)?.text("file") == name) data.remove(path)
        }
        data.remove("local:video:$reviewId")
    }
    companion object {
        private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
            .connectTimeout(10, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).callTimeout(120, TimeUnit.SECONDS).build()
    }
}
