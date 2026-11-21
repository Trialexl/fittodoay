package com.fittodoay.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.CancellationException
import kotlin.coroutines.resumeWithException
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : IOException(message)
data class UploadFile(val name: String, val mime: String, val file: java.io.File)

class Api(private val baseUrl: String = BuildConfig.SERVER_URL,
    private val storage: (() -> ResponseStorage?)? = null,
    private val networkAvailable: () -> Boolean = { true },
    private val onLocalRead: (() -> Unit)? = null,
    private val transportOverride: OkHttpClient? = null,
    private val token: () -> String) {
    companion object {
        // Authentication is attached per request, never to the shared connection pool.
        private val client = OkHttpClient.Builder().protocols(listOf(Protocol.HTTP_1_1)).callTimeout(30, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS)
            .followRedirects(false).followSslRedirects(false).build()
        private val longClient = client.newBuilder().callTimeout(180, TimeUnit.SECONDS).connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS).writeTimeout(180, TimeUnit.SECONDS).build()
    }

    suspend fun call(path: String, method: String = "GET", body: JSONObject? = null, useLocalFallback: Boolean = true): Any {
        val accountToken = token()
        val local = if (accountToken.isNotEmpty() && isLocalDataPath(path)) storage?.invoke() else null
        if (method == "GET" && !networkAvailable()) {
            if (!useLocalFallback) throw LocalDataUnavailableException()
            withContext(Dispatchers.IO) { local?.read(path) }?.let {
                if (token() != accountToken) throw CancellationException("Account changed")
                onLocalRead?.invoke(); return it
            }
            throw LocalDataUnavailableException()
        }
        val attempts = 4
        repeat(attempts) { attempt ->
            try {
                val result = execute(path, method, if (method == "GET" || method == "DELETE") null else
                    (body ?: JSONObject()).toString().toRequestBody("application/json; charset=utf-8".toMediaType()), accountToken)
                if (token() != accountToken) throw CancellationException("Account changed")
                if (token() == accountToken) {
                    withContext(Dispatchers.IO) {
                        if (method == "GET") local?.write(path, result)
                        else local?.recordMutation(path, method, body, result)
                    }
                }
                return result
            } catch (error: IOException) {
                // A failed TLS handshake happens before HTTP headers/body are sent, so it
                // can also be retried for mutations without repeating a server action.
                val assignmentPatch = method == "PATCH" && (path.startsWith("/api/workouts/logs/") || path.startsWith("/api/programs/") || path == "/api/profile/")
                val safe = method in listOf("GET", "PUT", "DELETE") || assignmentPatch || error is javax.net.ssl.SSLHandshakeException
                if (error is ApiException || error is java.io.InterruptedIOException || !safe || attempt == attempts - 1) {
                    if (useLocalFallback && method == "GET" && token() == accountToken && (error !is ApiException || error.status >= 500)) {
                        withContext(Dispatchers.IO) { local?.read(path) }?.let {
                            if (token() != accountToken) throw CancellationException("Account changed")
                            onLocalRead?.invoke(); return it
                        }
                    }
                    throw error
                }
                kotlinx.coroutines.delay(250L * (attempt + 1))
            }
        }
        error("Unreachable")
    }

    /** Replace a completed archive only after every page has arrived. */
    suspend fun all(path: String): Any {
        require(isLocalDataPath(path))
        val accountToken = token()
        val local = storage?.invoke()
        suspend fun saved(): Any? = withContext(Dispatchers.IO) { local?.read("local:archive:$path") ?: local?.read(path) }
        if (!networkAvailable()) return saved()?.also {
            if (token() != accountToken) throw CancellationException("Account changed")
            onLocalRead?.invoke()
        } ?: throw LocalDataUnavailableException()
        try {
            val remote = Api(baseUrl = baseUrl, transportOverride = transportOverride) { accountToken }
            val first = remote.call(path)
            val items = first.rows().toMutableList()
            val visited = mutableSetOf(path)
            var next = (first as? JSONObject)?.text("next").orEmpty()
            while (next.isNotBlank()) {
                val target = java.net.URI(next)
                val server = java.net.URI(baseUrl)
                require(!target.isAbsolute || target.scheme == server.scheme && target.host == server.host && target.port == server.port) { "Некорректный адрес страницы" }
                require(target.rawAuthority == null || target.isAbsolute) { "Некорректный адрес страницы" }
                val nextPath = target.rawPath + (target.rawQuery?.let { "?$it" } ?: "")
                require(nextPath.substringBefore('?') == path.substringBefore('?') && visited.add(nextPath)) { "Некорректная страница архива" }
                val page = remote.call(nextPath)
                items += page.rows()
                next = (page as? JSONObject)?.text("next").orEmpty()
            }
            val result = if (first is JSONObject && first.has("next")) JSONObject(first.toString()).put(if (first.has("results")) "results" else "items", JSONArray(items)).put("next", JSONObject.NULL) else first
            if (token() == accountToken) withContext(Dispatchers.IO) {
                local?.write("local:archive:$path", result); local?.write(path, result)
            }
            return result
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            if (token() == accountToken && isTransientLocalFailure(error)) saved()?.let { onLocalRead?.invoke(); return it }
            throw error
        }
    }

    suspend fun upload(path: String, field: String, filename: String, mime: String, file: java.io.File): Any {
        return uploadFiles(path, field, listOf(UploadFile(filename, mime, file)))
    }

    suspend fun uploadFiles(path: String, field: String, files: List<UploadFile>): Any {
        require(files.isNotEmpty())
        val accountToken = token()
        repeat(4) { attempt ->
            try {
                val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
                    files.forEach { addFormDataPart(field, it.name, it.file.asRequestBody(it.mime.toMediaType())) }
                }.build()
                val result = execute(path, "POST", body, accountToken)
                if (token() != accountToken) throw CancellationException("Account changed")
                if (accountToken.isNotEmpty() && token() == accountToken && isLocalDataPath(path)) {
                    withContext(Dispatchers.IO) { storage?.invoke()?.recordMutation(path, "POST", null, result) }
                }
                return result
            } catch (error: javax.net.ssl.SSLHandshakeException) {
                if (attempt == 3) throw error
                kotlinx.coroutines.delay(250L * (attempt + 1))
            }
        }
        error("Unreachable")
    }

    private suspend fun execute(path: String, method: String, body: RequestBody?, accountToken: String): Any = withContext(Dispatchers.IO) {
        require(path.startsWith("/api/") && !path.startsWith("//"))
        val request = Request.Builder().url(baseUrl.trimEnd('/') + path).method(method, body)
            .header("Accept", "application/json").apply {
                accountToken.takeIf { it.isNotEmpty() }?.let { header("Authorization", "Token $it") }
            }.build()
        val transport = transportOverride ?: if (body is MultipartBody || (method == "POST" && path.startsWith("/api/llm-agent/"))) longClient else client
        val response = suspendCancellableCoroutine<Response> { continuation ->
            val call = transport.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { continuation.resumeWithException(e) }
                override fun onResponse(call: Call, response: Response) { continuation.resume(response) { _, resource, _ -> resource.close() } }
            })
        }
        response.use {
            val text = response.body?.string().orEmpty()
            val parsed: Any = if (text.isBlank() && response.code == 204) JSONObject() else runCatching {
                if (text.trimStart().startsWith("[")) JSONArray(text) else JSONObject(text)
            }.getOrElse {
                if (response.isSuccessful) throw ApiException(502, "Сервер вернул некорректный ответ. Повторите позже.")
                JSONObject()
            }
            if (!response.isSuccessful) {
                val detail = (parsed as? JSONObject)?.let {
                    it.optString("message").ifBlank { it.optString("detail") }.ifBlank {
                        it.keys().asSequence().map { key -> "$key: ${it.opt(key)}" }.joinToString("\n")
                    }
                }.orEmpty()
                throw ApiException(response.code, detail.ifBlank { "Сервер вернул ошибку ${response.code}" })
            }
            parsed
        }
    }
}

fun obj(vararg pairs: Pair<String, Any?>) = JSONObject().apply {
    pairs.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
}
fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
fun Any.rows(): List<JSONObject> = when (this) {
    is JSONArray -> objects()
    is JSONObject -> (optJSONArray("items") ?: optJSONArray("results") ?: JSONArray()).objects()
    else -> emptyList()
}
fun JSONObject.array(key: String) = optJSONArray(key)?.objects().orEmpty()
fun JSONObject.text(key: String, fallback: String = "") = if (isNull(key)) fallback else optString(key, fallback)
