package com.fittodoay.android

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate

enum class Screen(val title: String) {
    Workout("Чеклист"), Programs("Программы"), Analytics("Аналитика"),
    Technique("Техника"), Assistant("Помощник"), Settings("Настройки")
}

class AppModel @JvmOverloads constructor(application: Application, private val baseUrl: String = BuildConfig.SERVER_URL, private val networkOverride: (() -> Boolean)? = null, private val transportOverride: okhttp3.OkHttpClient? = null) : AndroidViewModel(application) {
    private val session = SessionStore(application)
    var token by mutableStateOf(session.read()); private set
    // Kept in memory across rotation, never in saved instance state or preferences.
    var authPasswordDraft by mutableStateOf("")
    val api = Api(baseUrl = baseUrl, transportOverride = transportOverride, storage = { if (token.isEmpty()) null else localData() }, networkAvailable = ::isOnline,
        onLocalRead = { usingLocalData = true }) { token }
    val audio = AudioController(application)
    private val connectivity = application.getSystemService(android.net.ConnectivityManager::class.java)
    private val networkCallback = object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: android.net.Network, capabilities: android.net.NetworkCapabilities) {
            if (capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) viewModelScope.launch {
                if (token.isNotEmpty()) requestWorkoutSync(0)
                if (token.isNotEmpty()) synchronizeLocalData()
            }
        }
    }
    var screen by mutableStateOf(Screen.Workout)
    var focusBodyWeight by mutableStateOf(false)
    private val operations = mutableStateMapOf<String, String>()
    private val operationJobs = mutableMapOf<String, Job>()
    val busy get() = operations.containsKey(screen.name)
    val anyBusy get() = operations.isNotEmpty()
    val chatBusy get() = operations.containsKey("chat")
    val catalogLoading get() = operations.containsKey("catalog")
    var usingLocalData by mutableStateOf(false); private set
    var draftLoading by mutableStateOf(false); private set
    private var draftJob: Job? = null
    private var archiveJob: Job? = null
    private fun drafts() = LocalDrafts.get(getApplication(), token)
    fun flushDrafts() { if (token.isNotEmpty()) drafts().flushInBackground() }
    private fun bindLocalServices() {
        draftJob?.cancel(); archiveJob?.cancel()
        val account = token
        if (account.isEmpty()) return
        val draft = drafts()
        draftLoading = true
        draftJob = viewModelScope.launch {
            try { draft.awaitReady() }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { if (token == account) error = "Не удалось открыть сохранённые черновики." }
            finally { if (token == account) draftLoading = false }
            draft.error.collect { if (token == account && it != null) error = it }
        }
        if (baseUrl != BuildConfig.SERVER_URL) return
        archiveJob = viewModelScope.launch {
            androidx.work.WorkManager.getInstance(getApplication()).getWorkInfosForUniqueWorkFlow(ArchiveSync.name(account)).collect { infos ->
                if (token != account) return@collect
                val active = infos.firstOrNull { !it.state.isFinished }
                localSyncing = active != null
                if (active != null) {
                    localSyncMessage = when (active.state) {
                        androidx.work.WorkInfo.State.RUNNING -> active.progress.getString("stage") ?: "Обновляем локальную копию"
                        else -> if (active.runAttemptCount > 0) "Соединение прервалось. Продолжим сохранение автоматически." else "Локальная копия ожидает подключения"
                    }
                } else {
                    // Finished WorkInfo rows have no chronological ordering guarantee.
                    // The archive stores the last actual outcome and its timestamp.
                    val saved = withContext(Dispatchers.IO) { LocalDataStore(getApplication(), account).read("local:sync") as? JSONObject }
                    if (token == account) {
                        if (saved != null) {
                            localSyncResult = saved
                            localSyncMessage = if (saved.optBoolean("complete")) "Локальная копия обновлена" else "Сохранены доступные данные. Не удалось загрузить файлов или разделов: ${saved.array("failures").size}"
                        } else if (infos.isNotEmpty()) localSyncMessage = "Сохранение локальной копии приостановлено"
                    }
                }
            }
        }
    }
    private suspend fun readLocal(key: String): Any? { val account = token; return withContext(Dispatchers.IO) { LocalDataStore(getApplication(), account).read(key) } }
    private suspend fun writeLocal(key: String, value: Any) { val account = token; withContext(Dispatchers.IO) { LocalDataStore(getApplication(), account).write(key, value) } }
    private suspend fun removeLocal(key: String) { val account = token; withContext(Dispatchers.IO) { LocalDataStore(getApplication(), account).remove(key) } }
    var refreshing by mutableStateOf(false); private set
    var workoutSaving by mutableIntStateOf(0); private set
    var workoutSync by mutableStateOf(WorkoutSyncState()); private set
    private var refreshJob: Job? = null
    private var refreshGeneration = 0L
    private var analyticsShownRange = ""
    private var analyticsShownGranularity = ""
    private var repositoryJob: Job? = null
    private var workoutSyncJob: Job? = null
    private val savingKeys = mutableSetOf<String>()
    private fun repository() = WorkoutRepository.get(getApplication(), token, baseUrl, transportOverride)
    fun calendarHistory(start: String, end: String) = repository().observeHistory(start, end)
    suspend fun savedDailyLoads(start: String, end: String): StoredResponse? {
        val account = token
        val saved = withContext(Dispatchers.IO) { LocalDataStore(getApplication(), account).snapshot("/api/analytics/days/?start=$start&end=$end") }
        if (token != account) throw CancellationException("Account changed")
        return saved
    }
    private fun bindRepository() {
        repositoryJob?.cancel()
        bindLocalServices()
        val account = token
        if (account.isEmpty()) return
        val repo = repository()
        repositoryJob = viewModelScope.launch {
            launch { repo.state.collect { state -> if (token == account) { workoutSync = state; pendingCount = state.pending } } }
            launch { repo.observePending().collect { count -> if (token == account) pendingCount = count } }
            launch { repo.snapshot.collect { snapshot -> if (token == account && snapshot != null) {
                if (date == snapshot.date && repo.revision(snapshot.date) == snapshot.revision) plan = snapshot.plan
                snapshot.plan.optJSONObject("weigh_in")?.takeUnless { it.isNull("weight_kg") }?.let { value ->
                    weights = analyticsWeightRows(weights.filterNot { it.text("date") == snapshot.date } + JSONObject(value.toString()).put("date", snapshot.date), range)
                }
            } } }
            repo.initialize()
            if (repo.state.value.pending > 0) repo.schedule()
        }
    }
    fun retryWorkoutSync() { repository().schedule(); requestWorkoutSync(0) }
    private fun requestWorkoutSync(waitMs: Long = 600) {
        if (token.isEmpty() || workoutSyncJob?.isActive == true || !isOnline()) return
        val account = token; val repo = repository()
        workoutSyncJob = viewModelScope.launch {
            try { delay(waitMs); repo.synchronize { token == account } }
            catch (_: IOException) { /* WorkManager owns persisted retries; the repository exposes the failure. */ }
            finally { workoutSyncJob = null }
        }
    }
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
    private var timerGeneration = 0L
    private var timerChanging = false
    private var executionPending by mutableStateOf<JSONObject?>(null)
    private fun timerWrite(action: (TimerStore) -> Unit, applied: () -> Unit = {}) {
        if (token.isEmpty()) return
        val account = token; val generation = timerGeneration
        workoutSaving++
        viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                withContext(NonCancellable + Dispatchers.IO) { timerLocks.getOrPut(localAccountKey(account)) { Mutex() }.withLock { action(TimerStore(getApplication(), account)) } }
                if (token == account && generation == timerGeneration) applied()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (token == account) { timerChanging = false; error = "Не удалось сохранить таймер. Повторите действие." } }
            finally { workoutSaving-- }
        }
    }
    private var restEnd by mutableLongStateOf(0L)
    private fun timers() = TimerStore(getApplication(), token)
    var restUntil: Long
        get() = restEnd
        set(value) {
            restEnd = value
            if (value == 0L) { restPending = null; timerCollapsed = false }
            val state = obj("duration" to restDuration, "plan_id" to plan.optInt("id"), "date" to date)
            timerWrite({ if (value == 0L) it.clear("rest") else it.save("rest", value, state) })
        }
    var restDuration by mutableStateOf(60)
    private var executionEnd by mutableLongStateOf(0L)
    var executionUntil: Long
        get() = executionEnd
        set(value) { executionEnd = value; if (value == 0L) { executionPending = null; timerWrite({ it.clear("execution") }) } }
    var executionDone: (() -> Unit)? = null
    var recommendations by mutableStateOf<List<JSONObject>>(emptyList())
    var pendingCount by mutableIntStateOf(0)
    private fun offline() = OfflineStore(getApplication(), token)
    private fun localData() = LocalDataStore(getApplication(), token)
    private fun isOnline(): Boolean = networkOverride?.invoke() ?: (connectivity.getNetworkCapabilities(connectivity.activeNetwork)
        ?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
    var localSyncing by mutableStateOf(false); private set
    var localSyncMessage by mutableStateOf(""); private set
    var localSyncResult by mutableStateOf(JSONObject()); private set
    init {
        connectivity.registerDefaultNetworkCallback(networkCallback)
        if (token.isNotEmpty()) {
            val account = token
            workoutSaving++
            viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
                try {
                    val restored = withContext(Dispatchers.IO) { timerLocks.getOrPut(localAccountKey(account)) { Mutex() }.withLock {
                        val store = TimerStore(getApplication(), account)
                        listOf("rest", "execution").associateWith { kind -> store.read(kind)?.takeUnless { state ->
                            (state.optLong("end_at") > 0 && state.optLong("end_at") < System.currentTimeMillis() - 12 * 3600_000L).also { if (it) store.clear(kind) }
                        } }
                    } }
                    if (token == account) restored.forEach { (kind, state) -> if (state != null) {
                        date = state.text("date", date)
                        if (kind == "rest") { restEnd = state.optLong("end_at"); restDuration = state.optInt("duration", 60); restPending = state.optJSONObject("pending") }
                        else { executionEnd = state.optLong("end_at"); executionPending = state }
                        timerCollapsed = state.optBoolean("collapsed")
                    } }
                } finally { workoutSaving-- }
            }
            bindRepository()
            refresh()
        }
        viewModelScope.launch {
            while (true) { kotlinx.coroutines.delay(250); advanceWorkoutTimer() }
        }
    }
    override fun onCleared() { refreshJob?.cancel(); repositoryJob?.cancel(); workoutSyncJob?.cancel(); draftJob?.cancel(); archiveJob?.cancel(); flushDrafts(); connectivity.unregisterNetworkCallback(networkCallback); audio.release(); super.onCleared() }

    fun run(area: String = screen.name, block: suspend () -> Unit) {
        if (operations.containsKey(area)) return
        val account = token
        if (area == screen.name) { refreshGeneration++; refreshJob?.cancel(); refreshing = false }
        val ticket = java.util.UUID.randomUUID().toString()
        operations[area] = ticket; error = null; notice = null
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try { block() }
            catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (BuildConfig.DEBUG) android.util.Log.w("fitTODOay", "Operation failed: ${e.javaClass.simpleName}", e)
                if (account.isNotEmpty() && account != token) return@launch
                if (e is ApiException && e.status == 401) logout()
                error = when (e) {
                    is ApiException -> e.message
                    is LocalDataUnavailableException -> e.message
                    is IOException -> "Не удалось подключиться к серверу. Проверьте интернет и повторите."
                    else -> e.message ?: "Не удалось выполнить действие"
                }
            } finally { operationJobs.remove(ticket); if (operations[area] == ticket) operations.remove(area); if (token.isNotEmpty()) synchronizeLocalData() }
        }
        operationJobs[ticket] = job
        job.start()
    }

    fun auth(email: String, password: String, registration: JSONObject? = null) = run {
        val body = obj("email" to email.trim(), "password" to password)
        registration?.let { body.put("profile", it) }
        val result = api.call("/api/auth/${if (registration == null) "login" else "register"}/", "POST", body) as JSONObject
        val newToken = result.getString("token")
        session.write(newToken); token = newToken; audio.accountChanged()
        authPasswordDraft = ""
        bindRepository()
        restoreLocalData()
        load()
    }
    fun logout() {
        operationJobs.values.toList().forEach { it.cancel() }; operationJobs.clear()
        operations.clear()
        refreshGeneration++; refreshJob?.cancel(); refreshing = false
        repositoryJob?.cancel(); workoutSyncJob?.cancel(); workoutSync = WorkoutSyncState()
        focusBodyWeight = false
        authPasswordDraft = ""
        flushDrafts(); pauseLocalSync(); draftJob?.cancel(); archiveJob?.cancel(); draftLoading = false; usingLocalData = false; localSyncResult = JSONObject()
        timerGeneration++; timerChanging = false
        timerWrite({ it.clear("rest", dismissSignal = true); it.clear("execution", dismissSignal = true) })
        audio.stop(); pendingCount = 0
        session.write(""); token = ""; plan = JSONObject(); folders = emptyList(); templates = emptyList()
        catalog = emptyList(); customExercises = emptyList(); recommendations = emptyList()
        messages = emptyList(); chatThreads = emptyList(); chatReferences = emptyList(); threadId = null; chatProgram = null; preview = null
        profile = JSONObject(); preferences = JSONObject(); tracks = emptyList(); reviews = emptyList()
        days = emptyList(); weights = emptyList(); exerciseStats = emptyList(); trends = JSONObject()
        restUntil = 0; executionUntil = 0; executionDone = null; audio.accountChanged()
    }
    fun navigate(to: Screen) { screen = to; refresh() }
    fun refresh() {
        if (token.isEmpty()) return
        if (screen == Screen.Analytics) {
            val periodKey = "$range:${LocalDate.now()}"
            if (analyticsShownRange != periodKey) {
                days = emptyList(); weights = emptyList(); exerciseStats = emptyList(); trends = JSONObject()
                analyticsShownRange = periodKey
            }
            if (analyticsShownGranularity != granularity) { trends = JSONObject(); analyticsShownGranularity = granularity }
        }
        if (screen == Screen.Workout && plan.text("date") != date) plan = JSONObject()
        val generation = ++refreshGeneration
        val target = screen; val requestedDate = date; val account = token
        refreshJob?.cancel()
        refreshing = true; usingLocalData = false; error = null
        refreshJob = viewModelScope.launch {
            try { restoreLocalData(); load(target, requestedDate, generation) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == refreshGeneration && token == account) {
                if (e is ApiException && e.status == 401) logout()
                else error = e.message ?: "Не удалось обновить данные. Сохранённые результаты доступны на устройстве."
            } }
            finally { if (generation == refreshGeneration) refreshing = false }
        }
    }
    private suspend fun restoreLocalData() {
        val account = token; val target = screen; val requestedDate = date
        if (account.isEmpty()) return
        val repo = repository(); val revision = repo.revision(requestedDate)
        val cache = withContext(Dispatchers.IO) {
            val store = LocalDataStore(getApplication(), account)
            mutableMapOf<String, Any?>(
                "preferences" to store.read("/api/profile/preferences/"), "profile" to store.read("/api/profile/"),
                "folders" to store.read("/api/programs/folders/"), "templates" to store.read("/api/programs/templates/"),
                "preview" to store.read("local:preview"), "sync" to store.read("local:sync")
            ).apply { when (target) {
                Screen.Workout -> put("plan", repo.read(requestedDate) ?: store.snapshot("/api/workouts/plan/?date=$requestedDate")?.let { cached ->
                    (cached.value as? JSONObject)?.let { repo.acceptRemote(requestedDate, revision, normalizePlan(it), cached.asOf)?.plan }
                })
                Screen.Analytics -> {
                    val period = analyticsRangeQuery(range)
                    put("days", store.read("/api/analytics/days/?$period")); put("weights", store.read("/api/analytics/body-weight/?$period"))
                    put("queue", OfflineStore(getApplication(), account).queue())
                    put("stats", store.read("/api/analytics/exercises/?$period")); put("trends", store.read("/api/analytics/program-trends/?range=$range&granularity=$granularity"))
                }
                Screen.Technique -> put("reviews", store.read("/api/technique-reviews/"))
                else -> Unit
            } }
        }
        if (token != account || screen != target || date != requestedDate) return
        (cache["preferences"] as? JSONObject)?.let { preferences = it }; (cache["profile"] as? JSONObject)?.let { profile = it }
        cache["folders"]?.let { folders = it.rows() }; cache["templates"]?.let { templates = it.rows() }
        (cache["preview"] as? JSONObject)?.let { preview = it }; (cache["sync"] as? JSONObject)?.let { localSyncResult = it }
        if (repo.revision(requestedDate) == revision) (cache["plan"] as? JSONObject)?.let { plan = it }
        cache["days"]?.let { days = it.rows() }
        @Suppress("UNCHECKED_CAST")
        val cachedQueue = cache["queue"] as? List<JSONObject> ?: emptyList()
        cache["weights"]?.let { weights = analyticsWeightRows(withQueuedWeights(it.rows(), cachedQueue), range) }
        cache["stats"]?.let { exerciseStats = it.rows() }
        (cache["trends"] as? JSONObject)?.let { trends = it }; cache["reviews"]?.let { reviews = it.rows() }
        repo.initialize()
    }
    fun pauseLocalSync() {
        if (token.isNotEmpty() && baseUrl == BuildConfig.SERVER_URL) ArchiveSync.cancel(getApplication(), token)
        localSyncing = false; localSyncMessage = "Сохранение локальной копии приостановлено"
    }
    fun synchronizeLocalData(force: Boolean = false) {
        if (force && !isOnline()) localSyncMessage = "Локальная копия ожидает подключения"
        if (token.isEmpty() || baseUrl != BuildConfig.SERVER_URL) return
        val account = token
        viewModelScope.launch {
            try { ArchiveSync.schedule(getApplication(), account, force) }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { if (token == account) localSyncMessage = "Не удалось запланировать локальную копию. Повторите действие." }
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
    private suspend fun load(target: Screen = screen, requestedDate: String = date, generation: Long = refreshGeneration) {
        val account = token; val repo = repository()
        fun applies() = token == account && screen == target && generation == refreshGeneration && (target != Screen.Workout || date == requestedDate)
        requestWorkoutSync()
        when (target) {
            Screen.Programs -> {
                val result = coroutineScope { val f = async { api.call("/api/programs/folders/").rows() }; val t = async { api.call("/api/programs/templates/").rows() }; f.await() to t.await() }
                if (applies()) { folders = result.first; templates = result.second }
            }
            Screen.Workout -> {
                val revision = repo.revision(requestedDate)
                try {
                    val readStarted = System.currentTimeMillis()
                    val response = api.call("/api/workouts/plan/?date=$requestedDate", useLocalFallback = false) as JSONObject
                    val received = withContext(Dispatchers.Default) { normalizePlan(response) }
                    val accepted = repo.acceptRemote(requestedDate, revision, received, readStarted)
                    if (applies() && accepted != null && repo.revision(requestedDate) == accepted.revision) plan = accepted.plan
                } catch (e: IOException) {
                    if (e is ApiException) throw e
                    val stored = repo.read(requestedDate) ?: throw e
                    if (applies()) { plan = stored; usingLocalData = true }
                }
                if (applies()) recommendations = emptyList()
                try { val received = api.call("/api/workouts/music/tracks/").rows(); if (applies()) tracks = received }
                catch (e: IOException) { if (e is ApiException && e.status == 401) throw e }
            }
            Screen.Analytics -> coroutineScope {
                val period = analyticsRangeQuery(range)
                val d = async { api.call("/api/analytics/days/?$period").rows() }; val w = async { api.call("/api/analytics/body-weight/?$period").rows() }
                val e = async { api.call("/api/analytics/exercises/?$period").rows() }; val t = async { api.call("/api/analytics/program-trends/?range=$range&granularity=$granularity") as JSONObject }
                val f = async { api.call("/api/programs/folders/").rows() }
                val rd = d.await(); val rw = w.await(); val re = e.await(); val rt = t.await(); val rf = f.await()
                val queue = withContext(Dispatchers.IO) { offline().queue() }
                if (applies()) { days = rd; weights = analyticsWeightRows(withQueuedWeights(rw, queue), range); exerciseStats = re; trends = rt; folders = rf }
            }
            Screen.Technique -> { val received = api.all("/api/technique-reviews/").rows(); if (applies()) reviews = received }
            Screen.Assistant -> {
                val p = api.call("/api/profile/preferences/") as JSONObject; val f = api.call("/api/programs/folders/").rows()
                if (applies()) { preferences = p; folders = f }
            }
            Screen.Settings -> {
                val p = api.call("/api/profile/") as JSONObject; val pref = api.call("/api/profile/preferences/") as JSONObject
                if (applies()) { profile = p; preferences = pref }
                try { val received = api.call("/api/workouts/music/tracks/").rows(); if (applies()) tracks = received }
                catch (e: IOException) { if (e is ApiException && e.status == 401) throw e }
            }
        }
        if (preferences.length() == 0) try { val p = api.call("/api/profile/preferences/") as JSONObject; if (applies()) preferences = p }
        catch (e: IOException) { if (e is ApiException || target != Screen.Workout) throw e }
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
    fun loadCatalog(query: String = "") = run("catalog") {
        catalog = api.call("/api/exercises/?q=${java.net.URLEncoder.encode(query, "UTF-8")}").rows()
    }
    fun loadCustomExercises() = run { customExercises = api.call("/api/exercises/custom/").rows() }
    private fun localWorkoutWrite(key: String, saved: (() -> Unit)? = null, write: suspend (WorkoutRepository) -> WorkoutSnapshot) {
        if (token.isEmpty() || !savingKeys.add(key)) return
        val account = token; val repo = repository()
        workoutSaving++; error = null
        viewModelScope.launch {
            try {
                // Once accepted, a local write survives a ViewModel teardown. No network is awaited here.
                val snapshot = withContext(NonCancellable) { write(repo) }
                if (token == account) {
                    if (date == snapshot.date && repo.revision(snapshot.date) == snapshot.revision) plan = snapshot.plan
                    pendingCount = repo.state.value.pending
                    saved?.invoke(); requestWorkoutSync()
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (token == account) error = "Не удалось сохранить на устройстве. Повторите действие. ${e.message.orEmpty()}" }
            finally { savingKeys.remove(key); workoutSaving-- }
        }
    }
    fun logSet(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String, existing: JSONObject?, workoutDay: Int = plan.optInt("id"), workoutDate: String = date, onSaved: (() -> Unit)? = null) {
        val body = try { setLogPayload(workoutDay, exercise, set.getInt("set_index"), reps, weight, time) }
        catch (e: IllegalArgumentException) { error = e.message; return }
        val path = "/api/workouts/logs/" + (existing?.takeUnless { it.optBoolean("queued") }?.let { "${it.getInt("id")}/" } ?: "")
        val key = "set:$workoutDay:${exercise.getInt("template_exercise_id")}:${set.getInt("set_index")}"
        val base = plan
        localWorkoutWrite(key, onSaved) { it.stage(key, path, if (existing == null || existing.optBoolean("queued")) "POST" else "PATCH", workoutDate, body, existing?.takeUnless { it.optBoolean("queued") }, base) }
    }
    private fun beginRest(pending: JSONObject, duration: Int, clearExecution: Boolean = false) {
        timerChanging = true
        val deadline = if (duration > 0) System.currentTimeMillis() + duration * 1000L else 0L
        val saved = obj("duration" to duration, "date" to pending.text("date"), "plan_id" to pending.optInt("plan_id"), "pending" to pending)
        timerWrite({ if (clearExecution) it.clear("execution"); it.save("rest", deadline, saved) }) {
            executionEnd = 0; executionPending = null
            restDuration = duration; restPending = pending; restEnd = deadline
            restAutoAttempted = false; timerCollapsed = false; timerChanging = false; error = null
        }
    }
    fun openRest(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String,
        workoutDay: Int = plan.optInt("id"), workoutDate: String = date, restSeconds: Int? = null, finalSet: Boolean? = null) {
        if (timerChanging || workoutTimerActive) return
        val pending = obj("exercise" to exercise, "set" to set, "reps" to reps, "weight" to weight, "time" to time,
            "date" to workoutDate, "plan_id" to workoutDay, "is_final" to (finalSet ?: isFinalWorkoutSet(plan, exercise, set)))
        beginRest(pending, restSeconds ?: restSecondsForSet(plan, exercise, set))
    }
    fun editRest(field: String, value: String) {
        val pending = restPending ?: return
        if (field !in listOf("reps", "weight", "time")) return
        val updated = JSONObject(pending.toString()).put(field, value)
        restPending = updated
        timerWrite({ it.update("rest", obj("pending" to updated)) })
    }
    fun collapseWorkoutTimer(collapsed: Boolean) {
        timerCollapsed = collapsed
        val kind = if (executionUntil > 0) "execution" else "rest"
        timerWrite({ it.update(kind, obj("collapsed" to collapsed)) })
    }
    fun cancelWorkoutTimer() {
        timerGeneration++; timerChanging = false
        executionEnd = 0; executionPending = null; restEnd = 0; restPending = null; timerCollapsed = false; executionDone = null; error = null
        timerWrite({ it.clear("rest", dismissSignal = true); it.clear("execution", dismissSignal = true) })
    }
    fun finishRest() {
        val pending = restPending
        if (pending == null) { restUntil = 0; return }
        logSet(pending.getJSONObject("exercise"), pending.getJSONObject("set"), pending.text("reps"), pending.text("weight"), pending.text("time"), null,
            pending.getInt("plan_id"), pending.getString("date"), onSaved = { restUntil = 0 })
    }
    fun startExecution(exercise: JSONObject, set: JSONObject, reps: String, weight: String, time: String) {
        val seconds = time.toIntOrNull() ?: return
        if (seconds <= 0 || timerChanging || workoutTimerActive) return
        timerChanging = true
        val now = System.currentTimeMillis(); val deadline = now + seconds * 1000L
        val state = obj("exercise" to exercise, "set" to set, "reps" to reps, "weight" to weight, "time" to time,
            "date" to date, "plan_id" to plan.getInt("id"), "started_at" to now, "end_at" to deadline,
            "rest_seconds" to restSecondsForSet(plan, exercise, set), "is_final" to isFinalWorkoutSet(plan, exercise, set))
        timerWrite({ it.save("execution", deadline, state) }) {
            timerCollapsed = false; error = null; executionPending = state; executionEnd = deadline; timerChanging = false
        }
    }
    fun executionState(): JSONObject? = executionPending
    fun finishExecution(now: Long = System.currentTimeMillis()) {
        if (timerChanging) return
        val state = executionPending ?: return
        val pending = obj("exercise" to state.getJSONObject("exercise"), "set" to state.getJSONObject("set"), "reps" to state.text("reps"), "weight" to state.text("weight"),
            "time" to executionSeconds(state, now).toString(), "plan_id" to state.getInt("plan_id"), "date" to state.getString("date"), "is_final" to state.optBoolean("is_final"))
        beginRest(pending, state.optInt("rest_seconds", 10), clearExecution = true)
    }
    fun advanceWorkoutTimer(now: Long = System.currentTimeMillis()) {
        if (token.isEmpty() || timerChanging) return
        if (executionUntil > 0 && executionUntil <= now) { signalTimer(true); finishExecution(now) }
        else if (restPending != null && restDuration > 0 && restUntil <= now && !restAutoAttempted) {
            signalTimer(false); restAutoAttempted = true; finishRest()
        }
    }
    fun signalTimer(execution: Boolean) { timerWrite({ it.signalIfDue(if (execution) "execution" else "rest") }) }
    fun weighIn(value: String) {
        val kg = value.replace(',', '.').toDoubleOrNull()
        if (kg == null || kg !in 20.0..400.0) { error = "Укажите вес от 20 до 400 кг"; return }
        val workoutDate = date; val base = plan; val key = "weight:$workoutDate"
        localWorkoutWrite(key) { it.stage(key, "/api/workouts/weigh-in/", "PUT", workoutDate, obj("date" to workoutDate, "weight_kg" to kg), null, base) }
    }
    fun undoCompletedSet(log: JSONObject, onUndone: () -> Unit) {
        val base = plan; val workoutDate = date
        localWorkoutWrite("undo:${log.optInt("template_exercise")}:${log.optInt("set_index")}", onUndone) { it.undo(log, workoutDate, base) }
    }
    fun cancelQueued(log: JSONObject) = undoCompletedSet(log) {}
    private suspend fun syncBeforeAnalysis() {
        while (workoutSaving > 0) delay(10)
        val account = token; val repo = repository()
        if (repo.state.value.pending == 0) return
        require(isOnline()) { "Результаты сохранены на устройстве. Для анализа дождитесь подключения и отправки." }
        repo.synchronize { token == account }
        check(repo.state.value.pending == 0) { "Не удалось отправить результаты для анализа. Они сохранены на устройстве." }
    }
    fun generate(data: JSONObject) = run {
        saveAssistantAnswers(data); drafts().flush()
        require(isOnline()) { "Ответы сохранены на устройстве. Для генерации программы подключитесь к интернету." }
        preferences = api.call("/api/profile/preferences/", "PUT", data) as JSONObject
        preview = api.call("/api/llm-agent/programs/preview/", "POST", data) as JSONObject
        writeLocal("local:preview", requireNotNull(preview))
    }
    fun applyPreview() = run {
        val draft = requireNotNull(preview).getString("draft_id")
        api.call("/api/llm-agent/programs/drafts/$draft/apply/", "POST")
        removeLocal("local:preview")
        preview = null; screen = Screen.Programs; load(); notice = "Программы созданы"
    }
    fun discardPreview() = run("preview") { removeLocal("local:preview"); preview = null }
    fun openChat(programId: Int, mode: String = "program_edit", initialMessage: String? = null) {
        if (chatBusy) return
        val changed = chatProgram != programId
        chatProgram = programId
        if (changed) { threadId = null; messages = emptyList() }
        run("chat") {
        chatReferences = api.call("/api/programs/templates/?folder=$programId").rows().flatMap { it.array("template_exercises") }
        var archive = readLocal("local:threads")?.rows().orEmpty()
        try {
            archive = api.all("/api/llm-agent/threads/").rows()
            writeLocal("local:threads", JSONArray(archive))
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            if (!(error is ApiException && error.status in listOf(404, 405)) &&
                error !is LocalDataUnavailableException && !isTransientLocalFailure(error)) throw error
        }
        chatThreads = archive.filter { it.optInt("program") == programId }
        val known = readLocal("local:chat:$programId") as? JSONObject
        if (threadId == null) threadId = known?.getInt("id") ?: chatThreads.firstOrNull()?.getInt("id")
        if (threadId == null) {
            require(isOnline()) { "На устройстве пока нет переписки этой программы. Первый запуск чата требует подключения." }
            val result = api.call("/api/llm-agent/threads/", "POST", obj("program_id" to programId)) as JSONObject
            threadId = result.getInt("id"); chatProgram = programId
            writeLocal("local:chat:$programId", result)
            chatThreads = listOf(result) + chatThreads
            writeLocal("local:threads", JSONArray(listOf(result) + archive.filterNot { it.optInt("id") == result.optInt("id") }))
        }
        chatMode = mode
        if (initialMessage != null && mode.startsWith("post_workout")) syncBeforeAnalysis()
        if (initialMessage != null) api.call("/api/llm-agent/threads/$threadId/messages/", "POST", obj("message" to initialMessage, "mode" to mode, "workout_date" to date))
        messages = api.call("/api/llm-agent/threads/$threadId/messages/").rows()
        if (mode == "post_workout_review" && initialMessage != null) chatMode = "post_workout_chat"
        }
    }
    fun selectChat(thread: JSONObject) = run("chat") {
        require(thread.optInt("program") == chatProgram && chatThreads.any { it.optInt("id") == thread.optInt("id") })
        val history = api.call("/api/llm-agent/threads/${thread.getInt("id")}/messages/").rows()
        threadId = thread.getInt("id"); messages = history
        writeLocal("local:chat:$chatProgram", thread)
    }
    fun localReviewVideo(reviewId: Int) = if (token.isEmpty()) null else LocalMediaStore(getApplication(), token).reviewVideo(reviewId)
    suspend fun reviewVideo(review: JSONObject): java.io.File = LocalMediaStore(getApplication(), token).downloadReviewVideo(review)
    fun chatDraft(): String = if (token.isEmpty() || chatProgram == null) "" else drafts().read("local:chat-draft:$chatProgram")?.text("text").orEmpty()
    fun saveChatDraft(text: String) { if (token.isNotEmpty() && chatProgram != null) drafts().write("local:chat-draft:$chatProgram", obj("text" to text)) }
    fun assistantAnswers(): JSONObject = if (token.isEmpty()) JSONObject() else drafts().read("local:assistant-answers") ?: preferences
    fun saveAssistantAnswers(data: JSONObject) { if (token.isNotEmpty()) drafts().write("local:assistant-answers", data) }
    fun send(message: String, onSent: (() -> Unit)? = null) = run("chat") {
        require(message.isNotBlank()) { "Напишите сообщение" }
        val id = requireNotNull(threadId)
        val draftBeforeSend = chatDraft(); val program = chatProgram
        drafts().flush()
        if (chatMode.startsWith("post_workout")) syncBeforeAnalysis()
        api.call("/api/llm-agent/threads/$id/messages/", "POST", obj("message" to message, "mode" to chatMode, "workout_date" to date))
        if (chatProgram == program && chatDraft() == draftBeforeSend) saveChatDraft("")
        onSent?.invoke()
        messages = api.call("/api/llm-agent/threads/$id/messages/").rows()
    }
    fun proposal(messageId: Int, apply: Boolean) = run("chat") {
        val result = api.call("/api/llm-agent/threads/$threadId/${if (apply) "apply" else "cancel"}/", "POST", obj("message_id" to messageId))
        messages = api.call("/api/llm-agent/threads/$threadId/messages/").rows()
        load()
        val applied = (result as? JSONObject)?.array("applied").orEmpty()
        val skipped = applied.filter { it.text("status") == "skipped" }
        notice = if (!apply) "Предложение отклонено" else "Применено: ${applied.size - skipped.size}; пропущено: ${skipped.size}" +
            skipped.joinToString(separator = "\n", prefix = if (skipped.isEmpty()) "" else "\n") { it.text("reason", "Действие не удалось применить") }
    }
    fun recommendations() = run { syncBeforeAnalysis(); recommendations = (api.call("/api/workouts/recommendations/?date=$date") as JSONObject).array("folders") }
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
    fun saveDay(day: JSONObject, fields: JSONObject, order: List<Int>, saved: () -> Unit) = run {
        val id = day.optInt("id").takeIf { it > 0 }
        val originalOrder = day.array("template_exercises").map { it.getInt("id") }
        require(order.size == originalOrder.size && order.toSet() == originalOrder.toSet()) { "Состав упражнений изменился. Откройте день заново." }
        api.call("/api/programs/templates/" + (id?.let { "$it/" } ?: ""), if (id == null) "POST" else "PATCH", fields)
        if (id != null && order != originalOrder) api.call("/api/programs/template-exercises/reorder/", "POST", obj("template" to id, "order" to JSONArray(order)))
        saved(); load(); notice = "День сохранён"
    }
    private companion object { val timerLocks = java.util.concurrent.ConcurrentHashMap<String, Mutex>() }

    fun uploaded(path: String, field: String, name: String, mime: String, file: java.io.File) = run {
        try {
            val videoKey = "upload:${java.util.UUID.randomUUID()}"
            val video = if (path.startsWith("/api/technique-reviews/")) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                LocalMediaStore(getApplication(), token).preserveVideo(videoKey, file,
                    if (mime == "application/octet-stream") "video/*" else mime)
            } else null
            video?.let { writeLocal("local:video-upload:${it.name}", obj("name" to name, "file" to it.name, "status" to "stored")) }
            val result = api.upload(path, field, name, mime, file)
            if (video != null && result is JSONObject) {
                writeLocal("local:video:${result.getInt("id")}", obj("name" to name, "file" to video.name, "review" to result.getInt("id"), "media_key" to videoKey))
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
