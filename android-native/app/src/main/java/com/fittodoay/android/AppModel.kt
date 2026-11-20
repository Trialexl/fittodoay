package com.fittodoay.android

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate

enum class Screen(val title: String) {
    Workout("Чеклист"), Programs("Программы"), Analytics("Аналитика"),
    Technique("Техника"), Assistant("Помощник"), Settings("Профиль")
}

class AppModel(application: Application) : AndroidViewModel(application) {
    private val session = SessionStore(application)
    var token by mutableStateOf(session.read()); private set
    // Kept in memory across rotation, never in saved instance state or preferences.
    var authPasswordDraft by mutableStateOf("")
    val api = Api(storage = { if (token.isEmpty()) null else localData() }, networkAvailable = ::isOnline,
        onLocalRead = { notice = "Показаны данные с устройства. Изменения сервера обновятся после подключения." }) { token }
    val audio = AudioController(application)
    private val connectivity = application.getSystemService(android.net.ConnectivityManager::class.java)
    private val networkCallback = object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: android.net.Network, capabilities: android.net.NetworkCapabilities) {
            if (capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) viewModelScope.launch {
                if (token.isNotEmpty() && pendingCount > 0 && !busy) refresh()
                if (token.isNotEmpty()) synchronizeLocalData()
            }
        }
    }
    var screen by mutableStateOf(Screen.Workout)
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var notice by mutableStateOf<String?>(null)
    var folders by mutableStateOf<List<JSONObject>>(emptyList())
    var templates by mutableStateOf<List<JSONObject>>(emptyList())
    var catalog by mutableStateOf<List<JSONObject>>(emptyList())
    var customExercises by mutableStateOf<List<JSONObject>>(emptyList())
    var profile by mutableStateOf(JSONObject())
    var preferences by mutableStateOf(JSONObject())
    var plan by mutableStateOf(JSONObject())
    var date by mutableStateOf(LocalDate.now().toString())
    var reviews by mutableStateOf<List<JSONObject>>(emptyList())
    var tracks by mutableStateOf<List<JSONObject>>(emptyList())
    var days by mutableStateOf<List<JSONObject>>(emptyList())
    var weights by mutableStateOf<List<JSONObject>>(emptyList())
    var exerciseStats by mutableStateOf<List<JSONObject>>(emptyList())
    var trends by mutableStateOf(JSONObject())
    var range by mutableStateOf("month")
    var granularity by mutableStateOf("day")
    var threadId by mutableStateOf<Int?>(null)
    var chatProgram by mutableStateOf<Int?>(null)
    var messages by mutableStateOf<List<JSONObject>>(emptyList())
    var chatThreads by mutableStateOf<List<JSONObject>>(emptyList())
    var chatReferences by mutableStateOf<List<JSONObject>>(emptyList())
    var chatMode by mutableStateOf("program_edit")
    var preview by mutableStateOf<JSONObject?>(null)
    var restPending by mutableStateOf<JSONObject?>(null); private set
    var timerCollapsed by mutableStateOf(false); private set
    private var restAutoAttempted = false
    val workoutTimerActive get() = restPending != null || restUntil > 0 || executionUntil > 0
    private var restEnd by mutableLongStateOf(0L)
    private fun timers() = TimerStore(getApplication(), token)
    var restUntil: Long
        get() = restEnd
        set(value) {
            restEnd = value
            if (value == 0L) { restPending = null; timerCollapsed = false }
            if (token.isNotEmpty()) { if (value == 0L) timers().clear("rest") else timers().save("rest", value,
                obj("duration" to restDuration, "plan_id" to plan.optInt("id"), "date" to date)) }
        }
    var restDuration by mutableStateOf(60)
    private var executionEnd by mutableLongStateOf(0L)
    var executionUntil: Long
        get() = executionEnd
        set(value) { executionEnd = value; if (value == 0L && token.isNotEmpty()) timers().clear("execution") }
    var executionDone: (() -> Unit)? = null
    var recommendations by mutableStateOf<List<JSONObject>>(emptyList())
    var pendingCount by mutableIntStateOf(0)
    private var syncRetry: kotlinx.coroutines.Job? = null
    private var syncFailures = 0
    private var syncBlocked = false
    private fun offline() = OfflineStore(getApplication(), token)
    private fun localData() = LocalDataStore(getApplication(), token)
    private fun isOnline(): Boolean = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
        ?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    var localSyncing by mutableStateOf(false); private set
    var localSyncMessage by mutableStateOf(""); private set
    var localSyncResult by mutableStateOf(JSONObject()); private set
    private var localSyncJob: kotlinx.coroutines.Job? = null
    private var localSyncAttempt = 0L
    private var localSyncGeneration = 0L
    init {
        connectivity.registerDefaultNetworkCallback(networkCallback)
        if (token.isNotEmpty()) {
            for (kind in listOf("rest", "execution")) timers().read(kind)?.let { state ->
                if (state.optLong("end_at") > 0 && state.optLong("end_at") < System.currentTimeMillis() - 12 * 3600_000L) timers().clear(kind)
                else { date = state.text("date", date)
                    if (kind == "rest") { restEnd = state.optLong("end_at"); restDuration = state.optInt("duration", 60); restPending = state.optJSONObject("pending") }
                    else executionEnd = state.optLong("end_at")
                    timerCollapsed = state.optBoolean("collapsed")
                }
            }
            restoreLocalData()
            refresh()
        }
        viewModelScope.launch {
            while (true) { kotlinx.coroutines.delay(250); advanceWorkoutTimer() }
        }
    }
    override fun onCleared() { localSyncJob?.cancel(); connectivity.unregisterNetworkCallback(networkCallback); audio.release(); super.onCleared() }

    fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null; notice = null
        viewModelScope.launch {
            try { block() }
            catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (BuildConfig.DEBUG) android.util.Log.w("fitTODOay", "Operation failed: ${e.javaClass.simpleName}", e)
                if (e is ApiException && e.status == 401) logout()
                error = when (e) {
                    is ApiException -> e.message
                    is LocalDataUnavailableException -> e.message
                    is IOException -> "Не удалось подключиться к серверу. Проверьте интернет и повторите."
                    else -> e.message ?: "Не удалось выполнить действие"
                }
            } finally { busy = false; scheduleSyncRetry(); if (token.isNotEmpty()) synchronizeLocalData() }
        }
    }

    private fun scheduleSyncRetry() {
        if (pendingCount == 0 || token.isEmpty()) { syncFailures = 0; syncRetry?.cancel(); return }
        val online = connectivity.getNetworkCapabilities(connectivity.activeNetwork)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        if (!online || syncBlocked || syncRetry?.isActive == true) return
        val delayMs = (2000L shl syncFailures.coerceAtMost(4)).coerceAtMost(30_000L)
        syncFailures++
        syncRetry = viewModelScope.launch {
            kotlinx.coroutines.delay(delayMs)
            // Clear the job before refreshing so a failed attempt can schedule its successor.
            syncRetry = null
            if (!busy && token.isNotEmpty() && pendingCount > 0) refresh() else scheduleSyncRetry()
        }
    }

    fun auth(email: String, password: String, registration: JSONObject? = null) = run {
        val body = obj("email" to email.trim(), "password" to password)
        registration?.let { body.put("profile", it) }
        val result = api.call("/api/auth/${if (registration == null) "login" else "register"}/", "POST", body) as JSONObject
        val newToken = result.getString("token")
        session.write(newToken); token = newToken; audio.accountChanged()
        authPasswordDraft = ""
        restoreLocalData()
        load()
    }
    fun logout() {
        authPasswordDraft = ""
        pauseLocalSync(); localSyncResult = JSONObject(); localSyncAttempt = 0
        syncRetry?.cancel(); syncRetry = null; syncFailures = 0; syncBlocked = false
        if (token.isNotEmpty()) { timers().clear("rest"); timers().clear("execution") }
        audio.stop(); pendingCount = 0
        session.write(""); token = ""; plan = JSONObject(); folders = emptyList(); templates = emptyList()
        catalog = emptyList(); customExercises = emptyList(); recommendations = emptyList()
        messages = emptyList(); chatThreads = emptyList(); chatReferences = emptyList(); threadId = null; chatProgram = null; preview = null
        profile = JSONObject(); preferences = JSONObject(); tracks = emptyList(); reviews = emptyList()
        days = emptyList(); weights = emptyList(); exerciseStats = emptyList(); trends = JSONObject()
        restUntil = 0; executionUntil = 0; executionDone = null; audio.accountChanged()
    }
    fun navigate(to: Screen) { screen = to; restoreLocalData(); refresh() }
    fun refresh() {
        if (screen == Screen.Workout && plan.text("date") != date) { plan = JSONObject(); restoreLocalData() }
        run { load() }
    }
    private fun restoreLocalData() {
        if (token.isEmpty()) return
        val store = localData()
        (store.read("/api/profile/preferences/") as? JSONObject)?.let { preferences = it }
        (store.read("/api/profile/") as? JSONObject)?.let { profile = it }
        store.read("/api/programs/folders/")?.let { folders = it.rows() }
        store.read("/api/programs/templates/")?.let { templates = it.rows() }
        (store.read("local:preview") as? JSONObject)?.let { preview = it }
        (store.read("local:sync") as? JSONObject)?.let { localSyncResult = it }
        pendingCount = offline().queue().size
        when (screen) {
            Screen.Workout -> {
                val stored = store.read("/api/workouts/plan/?date=$date") as? JSONObject
                val cached = stored?.let(::normalizePlan) ?: offline().plan(date)
                cached?.let { plan = withQueuedChanges(it, offline().queue(), date) }
            }
            Screen.Analytics -> {
                store.read("/api/analytics/days/")?.let { days = it.rows() }
                store.read("/api/analytics/body-weight/")?.let { weights = it.rows() }
                store.read("/api/analytics/exercises/")?.let { exerciseStats = it.rows() }
                (store.read("/api/analytics/program-trends/?range=$range&granularity=$granularity") as? JSONObject)?.let { trends = it }
            }
            Screen.Technique -> store.read("/api/technique-reviews/")?.let { reviews = it.rows() }
            else -> Unit
        }
    }
    fun pauseLocalSync() { localSyncGeneration++; localSyncJob?.cancel(); localSyncJob = null; localSyncing = false; localSyncMessage = "Сохранение локальной копии приостановлено" }
    fun synchronizeLocalData(force: Boolean = false) {
        if (token.isEmpty()) return
        if (!isOnline()) { if (force) localSyncMessage = "Нет подключения. Сохранённые данные доступны без интернета."; return }
        if (localSyncJob?.isActive == true) { if (force) pauseLocalSync() else return }
        if (!force && System.currentTimeMillis() - localSyncAttempt < 15 * 60_000L) return
        val accountToken = token
        val generation = ++localSyncGeneration
        localSyncAttempt = System.currentTimeMillis()
        localSyncJob = viewModelScope.launch {
            if (!force) kotlinx.coroutines.delay(5000)
            while (busy) kotlinx.coroutines.delay(500)
            if (token != accountToken || !isOnline()) return@launch
            localSyncing = true
            for (attempt in 0..4) {
            var retry = false
            try {
                val result = LocalMirror(getApplication(), accountToken).synchronize { stage ->
                    viewModelScope.launch { if (token == accountToken && localSyncGeneration == generation) localSyncMessage = stage }
                }
                if (token == accountToken && localSyncGeneration == generation) {
                    localSyncResult = result
                    localSyncMessage = if (result.optBoolean("complete")) "Локальная копия обновлена" else "Сохранены доступные данные. Не удалось загрузить файлов или разделов: ${result.array("failures").size}"
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (token == accountToken && localSyncGeneration == generation) {
                    retry = isTransientLocalFailure(e)
                    localSyncMessage = if (e is LocalStorageException) e.message.orEmpty() else "Не удалось завершить локальную копию. Сохранённые данные доступны без сети."
                    localSyncResult = obj("finished_at" to System.currentTimeMillis(), "complete" to false,
                        "failures" to JSONArray().put(obj("error" to (e.message ?: "Ошибка синхронизации"))))
                    runCatching { localData().write("local:sync", localSyncResult) }
                }
            }
            if (!retry || token != accountToken || localSyncGeneration != generation) break
            localSyncAttempt = 0
            if (!isOnline() || attempt == 4) break
            localSyncMessage = "Соединение прервалось. Продолжим сохранение автоматически; уже загруженные файлы останутся."
            kotlinx.coroutines.delay((5000L shl attempt).coerceAtMost(60_000))
            while (busy) kotlinx.coroutines.delay(500)
            }
            if (token == accountToken && localSyncGeneration == generation) localSyncing = false
        }
    }
    suspend fun imageOnDevice(url: String): Any? {
        if (token.isEmpty()) return null
        val media = LocalMediaStore(getApplication(), token)
        media.existing(url)?.let { return it }
        if (!isOnline()) return null
        return try { media.image(url) } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }
    }
    private suspend fun load() {
        syncQueue()
        when (screen) {
            Screen.Programs -> { folders = api.call("/api/programs/folders/").rows(); templates = api.call("/api/programs/templates/").rows() }
            Screen.Workout -> {
                val requestedDate = date
                try {
                    val received = withQueuedChanges(normalizePlan(api.call("/api/workouts/plan/?date=$requestedDate") as JSONObject), offline().queue(), requestedDate)
                    offline().cache(requestedDate, received)
                    if (date == requestedDate) plan = received
                } catch (e: IOException) {
                    if (e is ApiException) throw e
                    val stored = offline().plan(requestedDate) ?: throw e
                    if (date == requestedDate) plan = stored
                    notice = "Нет соединения. Показан сохранённый план; изменения будут отправлены при восстановлении сети."
                }
                recommendations = emptyList()
                try { tracks = api.call("/api/workouts/music/tracks/").rows() } catch (e: IOException) { if (e is ApiException && e.status == 401) throw e }
            }
            Screen.Analytics -> {
                days = api.call("/api/analytics/days/").rows()
                weights = api.call("/api/analytics/body-weight/").rows()
                exerciseStats = api.call("/api/analytics/exercises/").rows()
                trends = api.call("/api/analytics/program-trends/?range=$range&granularity=$granularity") as JSONObject
                folders = api.call("/api/programs/folders/").rows()
            }
            Screen.Technique -> reviews = api.all("/api/technique-reviews/").rows()
            Screen.Assistant -> { preferences = api.call("/api/profile/preferences/") as JSONObject; folders = api.call("/api/programs/folders/").rows() }
            Screen.Settings -> { profile = api.call("/api/profile/") as JSONObject; preferences = api.call("/api/profile/preferences/") as JSONObject
                try { tracks = api.call("/api/workouts/music/tracks/").rows() } catch (e: IOException) { if (e is ApiException && e.status == 401) throw e } }
        }
        if (preferences.length() == 0) try { preferences = api.call("/api/profile/preferences/") as JSONObject }
        catch (e: IOException) { if (e is ApiException || screen != Screen.Workout) throw e }
    }
    private suspend fun syncQueue() {
        val store = offline()
        syncBlocked = false
        pendingCount = store.queue().size
        try {
            for (entry in store.queue()) {
                val body = entry.getJSONObject("body")
                var path = entry.getString("path"); var method = entry.getString("method")
                if (path == "/api/workouts/logs/" && method == "POST") {
                    val current = normalizePlan(api.call("/api/workouts/plan/?date=${entry.text("date")}") as JSONObject)
                    val existing = current.array("logs").find { it.optInt("template_exercise") == body.optInt("template_exercise") && it.optInt("set_index") == body.optInt("set_index") }
                    if (existing != null) { path += "${existing.getInt("id")}/"; method = "PATCH" }
                }
                api.call(path, method, body); store.remove(entry.getString("key"))
                pendingCount = store.queue().size
            }
        } catch (e: IOException) {
            if (e is ApiException) {
                syncBlocked = e.status in 400..499 && e.status !in listOf(408, 429)
                throw e
            }
        }
    }
    fun save(path: String, data: JSONObject, id: Any? = null, onSaved: (() -> Unit)? = null) = run {
        api.call(path + (id?.let { "$it/" } ?: ""), if (id == null) "POST" else "PATCH", data)
        onSaved?.invoke(); load(); notice = "Сохранено"
    }
    fun delete(path: String, onDeleted: (() -> Unit)? = null) = run {
        api.call(path, "DELETE")
        Regex("^/api/technique-reviews/(\\d+)/$").matchEntire(path)?.groupValues?.get(1)?.toIntOrNull()?.let { reviewId ->
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { LocalMediaStore(getApplication(), token).removeReviewVideo(reviewId) }
        }
        onDeleted?.invoke(); load(); notice = "Удалено"
    }
    fun preferences(data: JSONObject) = run {
        preferences = api.call("/api/profile/preferences/", "PUT", data) as JSONObject
        notice = "Настройки сохранены"
    }
    fun loadCatalog(query: String = "") = run {
        catalog = api.call("/api/exercises/?q=${java.net.URLEncoder.encode(query, "UTF-8")}").rows()
    }
    fun loadCustomExercises() = run { customExercises = api.call("/api/exercises/custom/").rows() }
    fun logSet(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String, existing: JSONObject?, workoutDay: Int = plan.optInt("id"), workoutDate: String = date, onSaved: (() -> Unit)? = null) = run {
        val body = setLogPayload(workoutDay, exercise, set.getInt("set_index"), reps, weight, time)
        val path = "/api/workouts/logs/" + (existing?.takeUnless { it.optBoolean("queued") }?.let { "${it.getInt("id")}/" } ?: "")
        val method = if (existing == null || existing.optBoolean("queued")) "POST" else "PATCH"
        val store = offline()
        val key = "set:$workoutDay:${exercise.getInt("template_exercise_id")}:${set.getInt("set_index")}"
        val alreadyQueued = store.queue().any { it.text("key") == key }
        if (alreadyQueued) store.enqueue(key, path, method, workoutDate, body, existing?.takeUnless { it.optBoolean("queued") })
        try {
            if (!isOnline()) throw IOException("Offline workout result")
            if (alreadyQueued) {
                syncQueue()
                if (store.queue().any { it.text("key") == key }) throw IOException("Pending synchronization")
            } else api.call(path, method, body)
            val updated = normalizePlan(api.call("/api/workouts/plan/?date=$workoutDate") as JSONObject)
            store.cache(workoutDate, updated)
            if (date == workoutDate) plan = updated
        } catch (e: IOException) {
            if (e is ApiException) throw e
            store.enqueue(key, path, method, workoutDate, body, existing?.takeUnless { it.optBoolean("queued") })
            val local = JSONObject(body.toString()).put("id", -1).put("queued", true).put("queue_key", key)
            val logs = plan.array("logs").filterNot { it.optInt("template_exercise") == exercise.getInt("template_exercise_id") && it.optInt("set_index") == set.getInt("set_index") }
            if (date == workoutDate) { plan = JSONObject(plan.toString()).put("logs", JSONArray(logs + local)); store.cache(workoutDate, plan) }
            pendingCount = store.queue().size
            notice = "Подход сохранён на устройстве. Нажмите «Обновить» после восстановления сети для синхронизации."
        }
        onSaved?.invoke()
    }
    fun openRest(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String,
        workoutDay: Int = plan.optInt("id"), workoutDate: String = date, restSeconds: Int? = null, finalSet: Boolean? = null) {
        if (busy || workoutTimerActive) return
        val pending = obj("exercise" to exercise, "set" to set, "reps" to reps, "weight" to weight, "time" to time,
            "date" to workoutDate, "plan_id" to workoutDay, "is_final" to (finalSet ?: isFinalWorkoutSet(plan, exercise, set)))
        restDuration = restSeconds ?: restSecondsForSet(plan, exercise, set)
        restPending = pending; restAutoAttempted = false; timerCollapsed = false; error = null
        restEnd = if (restDuration > 0) System.currentTimeMillis() + restDuration * 1000L else 0L
        timers().save("rest", restEnd, obj("duration" to restDuration, "date" to workoutDate, "plan_id" to workoutDay, "pending" to pending))
    }
    fun editRest(field: String, value: String) {
        val pending = restPending ?: return
        if (field !in listOf("reps", "weight", "time") || busy) return
        restPending = JSONObject(pending.toString()).put(field, value)
        timers().update("rest", obj("pending" to restPending))
    }
    fun collapseWorkoutTimer(collapsed: Boolean) {
        timerCollapsed = collapsed
        timers().update(if (executionUntil > 0) "execution" else "rest", obj("collapsed" to collapsed))
    }
    fun cancelWorkoutTimer() {
        if (busy) return
        executionUntil = 0; restUntil = 0; executionDone = null; error = null
    }
    fun finishRest() {
        val pending = restPending
        if (pending == null) { restUntil = 0; return }
        if (busy) return
        try { setLogPayload(pending.getInt("plan_id"), pending.getJSONObject("exercise"), pending.getJSONObject("set").getInt("set_index"), pending.text("reps"), pending.text("weight"), pending.text("time")) }
        catch (e: IllegalArgumentException) { error = e.message; return }
        logSet(pending.getJSONObject("exercise"), pending.getJSONObject("set"), pending.text("reps"), pending.text("weight"), pending.text("time"), null,
            pending.getInt("plan_id"), pending.getString("date"), onSaved = { restUntil = 0 })
    }
    fun startExecution(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String) {
        val seconds = time.toIntOrNull() ?: return
        if (seconds <= 0 || busy || workoutTimerActive) return
        val now = System.currentTimeMillis()
        val state = obj("exercise" to exercise, "set" to set, "reps" to reps, "weight" to weight, "time" to time,
            "date" to date, "plan_id" to plan.getInt("id"), "started_at" to now, "rest_seconds" to restSecondsForSet(plan, exercise, set), "is_final" to isFinalWorkoutSet(plan, exercise, set))
        timerCollapsed = false; error = null
        executionEnd = now + seconds * 1000L
        timers().save("execution", executionEnd, state)
    }
    fun executionState(): JSONObject? = timers().read("execution")
    fun finishExecution(now: Long = System.currentTimeMillis()) {
        if (busy) return
        val state = timers().read("execution") ?: return
        val actualTime = executionSeconds(state, now).toString()
        executionUntil = 0
        openRest(state.getJSONObject("exercise"), state.getJSONObject("set"), state.text("reps"), state.text("weight"), actualTime,
            state.getInt("plan_id"), state.getString("date"), state.optInt("rest_seconds", 10), state.optBoolean("is_final"))
    }
    fun advanceWorkoutTimer(now: Long = System.currentTimeMillis()) {
        if (token.isEmpty() || busy) return
        if (executionUntil > 0 && executionUntil <= now) { signalTimer(true); finishExecution(now) }
        else if (restPending != null && restDuration > 0 && restUntil <= now && !restAutoAttempted) {
            signalTimer(false); restAutoAttempted = true; finishRest()
        }
    }
    fun signalTimer(execution: Boolean) {
        val kind = if (execution) "execution" else "rest"
        val store = timers(); val state = store.read(kind) ?: return
        if (store.claimSignal(kind, state.text("id"))) TimerReceiver.signal(getApplication(), kind)
    }
    fun weighIn(value: String) = run {
        val kg = value.replace(',', '.').toDoubleOrNull()
        require(kg != null && kg in 20.0..400.0) { "Укажите вес от 20 до 400 кг" }
        val body = obj("date" to date, "weight_kg" to kg)
        val store = offline(); val key = "weight:$date"
        if (store.queue().any { it.text("key") == key }) store.enqueue(key, "/api/workouts/weigh-in/", "PUT", date, body)
        try { api.call("/api/workouts/weigh-in/", "PUT", body); store.remove(key); load(); notice = "Вес сохранён" }
        catch (e: IOException) {
            if (e is ApiException) throw e
            val store = offline(); store.enqueue("weight:$date", "/api/workouts/weigh-in/", "PUT", date, body)
            plan = JSONObject(plan.toString()).put("weigh_in", body); store.cache(date, plan); pendingCount = store.queue().size
            notice = "Вес сохранён на устройстве. Нажмите «Обновить» после восстановления сети."
        }
    }
    fun undoCompletedSet(log: JSONObject, onUndone: () -> Unit) {
        val store = offline()
        val original = if (log.optBoolean("queued")) store.queue().firstOrNull { it.text("key") == log.text("queue_key") }?.optJSONObject("original") else log
        if (original == null) { cancelQueued(log); onUndone(); return }
        run {
            require(isOnline()) { "Подключитесь к интернету, чтобы отменить сохранённое на сервере выполнение." }
            api.call("/api/workouts/logs/${original.getInt("id")}/", "DELETE")
            if (log.optBoolean("queued")) store.remove(log.getString("queue_key"))
            plan = JSONObject(plan.toString()).put("logs", JSONArray(plan.array("logs").filterNot {
                it.optInt("template_exercise") == log.optInt("template_exercise") && it.optInt("set_index") == log.optInt("set_index")
            }))
            store.cache(date, plan); pendingCount = store.queue().size
            onUndone(); load()
        }
    }
    fun cancelQueued(log: JSONObject) {
        val store = offline(); val original = store.queue().firstOrNull { it.text("key") == log.text("queue_key") }?.optJSONObject("original")
        store.remove(log.getString("queue_key"))
        val kept = plan.array("logs").filterNot { it.text("queue_key") == log.text("queue_key") }
        plan = JSONObject(plan.toString()).put("logs", JSONArray(kept + listOfNotNull(original)))
        store.cache(date, plan); pendingCount = store.queue().size
    }
    fun generate(data: JSONObject) = run {
        localData().write("local:assistant-answers", data)
        require(isOnline()) { "Ответы сохранены на устройстве. Для генерации программы подключитесь к интернету." }
        preferences = api.call("/api/profile/preferences/", "PUT", data) as JSONObject
        preview = api.call("/api/llm-agent/programs/preview/", "POST", data) as JSONObject
        localData().write("local:preview", requireNotNull(preview))
    }
    fun applyPreview() = run {
        val draft = requireNotNull(preview).getString("draft_id")
        api.call("/api/llm-agent/programs/drafts/$draft/apply/", "POST")
        localData().remove("local:preview")
        preview = null; screen = Screen.Programs; load(); notice = "Программы созданы"
    }
    fun discardPreview() { preview = null; if (token.isNotEmpty()) localData().remove("local:preview") }
    fun openChat(programId: Int, mode: String = "program_edit", initialMessage: String? = null) {
        if (busy) return
        val changed = chatProgram != programId
        chatProgram = programId
        if (changed) { threadId = null; messages = emptyList() }
        run {
        chatReferences = api.call("/api/programs/templates/?folder=$programId").rows().flatMap { it.array("template_exercises") }
        var archive = localData().read("local:threads")?.rows().orEmpty()
        try {
            archive = api.all("/api/llm-agent/threads/").rows()
            localData().write("local:threads", JSONArray(archive))
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            if (!(error is ApiException && error.status in listOf(404, 405)) &&
                error !is LocalDataUnavailableException && !isTransientLocalFailure(error)) throw error
        }
        chatThreads = archive.filter { it.optInt("program") == programId }
        val known = localData().read("local:chat:$programId") as? JSONObject
        if (threadId == null) threadId = known?.getInt("id") ?: chatThreads.firstOrNull()?.getInt("id")
        if (threadId == null) {
            require(isOnline()) { "На устройстве пока нет переписки этой программы. Первый запуск чата требует подключения." }
            val result = api.call("/api/llm-agent/threads/", "POST", obj("program_id" to programId)) as JSONObject
            threadId = result.getInt("id"); chatProgram = programId
            localData().write("local:chat:$programId", result)
            chatThreads = listOf(result) + chatThreads
            localData().write("local:threads", JSONArray(listOf(result) + archive.filterNot { it.optInt("id") == result.optInt("id") }))
        }
        chatMode = mode
        if (initialMessage != null) api.call("/api/llm-agent/threads/$threadId/messages/", "POST", obj("message" to initialMessage, "mode" to mode, "workout_date" to date))
        messages = api.call("/api/llm-agent/threads/$threadId/messages/").rows()
        if (mode == "post_workout_review" && initialMessage != null) chatMode = "post_workout_chat"
        }
    }
    fun selectChat(thread: JSONObject) = run {
        require(thread.optInt("program") == chatProgram && chatThreads.any { it.optInt("id") == thread.optInt("id") })
        val history = api.call("/api/llm-agent/threads/${thread.getInt("id")}/messages/").rows()
        threadId = thread.getInt("id"); messages = history
        localData().write("local:chat:$chatProgram", thread)
    }
    fun localReviewVideo(reviewId: Int) = if (token.isEmpty()) null else LocalMediaStore(getApplication(), token).reviewVideo(reviewId)
    suspend fun reviewVideo(review: JSONObject): java.io.File = LocalMediaStore(getApplication(), token).downloadReviewVideo(review)
    fun chatDraft(): String = if (token.isEmpty() || chatProgram == null) "" else (localData().read("local:chat-draft:$chatProgram") as? JSONObject)?.text("text").orEmpty()
    fun saveChatDraft(text: String) { if (token.isNotEmpty() && chatProgram != null) localData().write("local:chat-draft:$chatProgram", obj("text" to text)) }
    fun assistantAnswers(): JSONObject = if (token.isEmpty()) JSONObject() else (localData().read("local:assistant-answers") as? JSONObject) ?: preferences
    fun saveAssistantAnswers(data: JSONObject) { if (token.isNotEmpty()) localData().write("local:assistant-answers", data) }
    fun send(message: String, onSent: (() -> Unit)? = null) = run {
        require(message.isNotBlank()) { "Напишите сообщение" }
        val id = requireNotNull(threadId)
        api.call("/api/llm-agent/threads/$id/messages/", "POST", obj("message" to message, "mode" to chatMode, "workout_date" to date))
        saveChatDraft("")
        onSent?.invoke()
        messages = api.call("/api/llm-agent/threads/$id/messages/").rows()
    }
    fun proposal(messageId: Int, apply: Boolean) = run {
        val result = api.call("/api/llm-agent/threads/$threadId/${if (apply) "apply" else "cancel"}/", "POST", obj("message_id" to messageId))
        messages = api.call("/api/llm-agent/threads/$threadId/messages/").rows()
        load()
        val applied = (result as? JSONObject)?.array("applied").orEmpty()
        val skipped = applied.filter { it.text("status") == "skipped" }
        notice = if (!apply) "Предложение отклонено" else "Применено: ${applied.size - skipped.size}; пропущено: ${skipped.size}" +
            skipped.joinToString(separator = "\n", prefix = if (skipped.isEmpty()) "" else "\n") { it.text("reason", "Действие не удалось применить") }
    }
    fun recommendations() = run { recommendations = (api.call("/api/workouts/recommendations/?date=$date") as JSONObject).array("folders") }
    fun applyRecommendations(items: List<JSONObject>) = run {
        api.call("/api/workouts/recommendations/apply/", "POST", obj("date" to date, "items" to JSONArray(items)))
        load(); notice = "Рекомендации применены"
    }
    fun reorder(template: JSONObject, from: Int, to: Int) = run {
        val order = template.array("template_exercises").map { it.getInt("id") }.toMutableList()
        if (to !in order.indices) return@run
        order.add(to, order.removeAt(from))
        api.call("/api/programs/template-exercises/reorder/", "POST", obj("template" to template.getInt("id"), "order" to JSONArray(order)))
        load()
    }
    fun uploaded(path: String, field: String, name: String, mime: String, file: java.io.File) = run {
        try {
            val videoKey = "upload:${java.util.UUID.randomUUID()}"
            val video = if (path.startsWith("/api/technique-reviews/")) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                LocalMediaStore(getApplication(), token).preserveVideo(videoKey, file,
                    if (mime == "application/octet-stream") "video/*" else mime)
            } else null
            video?.let { localData().write("local:video-upload:${it.name}", obj("name" to name, "file" to it.name, "status" to "stored")) }
            val result = api.upload(path, field, name, mime, file)
            if (video != null && result is JSONObject) {
                localData().write("local:video:${result.getInt("id")}", obj("name" to name, "file" to video.name, "review" to result.getInt("id"), "media_key" to videoKey))
                localData().remove("local:video-upload:${video.name}")
            }
            acceptUpload(path, result)
        } finally { file.delete() }
    }
    fun uploadedMusicBatch(files: List<UploadFile>) = run {
        try {
            val path = "/api/workouts/music/tracks/upload/"
            val result = api.uploadFiles(path, "files", files)
            acceptUpload(path, result)
            notice = "Файлов загружено: ${result.rows().size}"
        } finally { files.forEach { it.file.delete() } }
    }
    private suspend fun acceptUpload(path: String, result: Any) {
            if (path.startsWith("/api/technique-reviews/")) {
                (result as? JSONObject)?.let { reviews = listOf(it) + reviews.filter { previous -> previous.optInt("id") != it.optInt("id") } }
            } else tracks = result.rows() + tracks.filter { previous -> result.rows().none { it.optInt("id") == previous.optInt("id") } }
            notice = "Файл загружен"
            try {
                if (path.startsWith("/api/technique-reviews/")) reviews = api.all("/api/technique-reviews/").rows()
                else tracks = api.call("/api/workouts/music/tracks/").rows()
            } catch (e: IOException) {
                if (e is ApiException) throw e
                notice = "Файл загружен. Не удалось обновить список; повторите обновление."
            }
    }
}
