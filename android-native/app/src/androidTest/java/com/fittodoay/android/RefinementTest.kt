@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)

package com.fittodoay.android

import android.app.Application
import android.os.StrictMode
import androidx.activity.ComponentActivity
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/** Isolated UI, Room migration and WorkManager privacy checks; no test HTTP requests. */
class RefinementTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>(effectContext = NoMotion)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var original: String
    private lateinit var account: String
    private lateinit var model: AppModel
    private val models = ViewModelStore()
    @Before fun prepare() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("refinement") == "true")
        original = SessionStore(context).read()
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == localAccountKey(original))
        account = "refinement:${UUID.randomUUID()}"
        LocalDataStore(context, account).apply {
            write("/api/profile/preferences/", obj("design_version" to "v2", "theme" to "light"))
            write("/api/programs/folders/", JSONArray()); write("/api/programs/templates/", JSONArray())
            write("/api/workouts/plan/?date=${java.time.LocalDate.now()}", obj("id" to 919191, "date" to java.time.LocalDate.now().toString(), "folders" to JSONArray(), "logs" to JSONArray()))
        }
        SessionStore(context).write(account)
        compose.runOnUiThread { model = AppModel(context.applicationContext as Application, "https://refinement.invalid", { false }); models.put("model", model) }
        compose.waitUntil(10_000) { !model.refreshing && !model.draftLoading && model.workoutSaving == 0 }
    }
    private fun capture(name: String) {
        compose.waitForIdle(); instrumentation.waitForIdleSync()
        androidx.test.uiautomator.UiDevice.getInstance(instrumentation).waitForIdle(1000)
        val directory = File(context.filesDir, "extended-parity").apply { mkdirs() }
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            File(directory, name + (InstrumentationRegistry.getArguments().getString("refinementTheme")?.let { "-$it-${InstrumentationRegistry.getArguments().getString("layoutName") ?: "reference"}" } ?: "") + ".png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        }
    }
    @After fun restore() {
        if (::original.isInitialized) SessionStore(context).write(original)
        if (::model.isInitialized) {
            runBlocking { LocalDrafts.get(context, account).flush() }
            compose.runOnUiThread { model.cancelWorkoutTimer(); models.clear() }
        }
    }
    @Test fun chatTypingUsesNoUiStorageAndLongHistoryRemainsVirtualized() = runBlocking<Unit> {
        compose.runOnUiThread {
            model.chatProgram = 9191; model.threadId = 9192
            model.messages = (1..200).map { obj("id" to it, "role" to if (it % 2 == 0) "assistant" else "user", "content" to "Сообщение $it: проверка длинного диалога и прокрутки") }
        }
        var open by mutableStateOf(true)
        compose.setContent { MaterialTheme(colorScheme = fitColors(InstrumentationRegistry.getArguments().getString("refinementTheme") == "dark", androidx.compose.ui.graphics.Color(0xffa855f7), true), typography = FitTypography, shapes = FitShapes) { if (open) ChatDialog(model) { open = false } else Button(onClick = { open = true }) { Text("Открыть снова") } } }
        compose.onNodeWithText("Сообщение 200:", substring = true).assertIsDisplayed()
        val composed = compose.onAllNodes(hasText("проверка длинного диалога", substring = true)).fetchSemanticsNodes().size
        assertTrue("Only a viewport-sized part of 200 messages should be composed; actual=$composed", composed < 100)
        compose.onNodeWithText("Сообщение 1:", substring = true).assertDoesNotExist()
        compose.runOnUiThread { model.messages = model.messages + listOf(obj("id" to 201, "role" to "user", "content" to "Новое сообщение 201"), obj("id" to 202, "role" to "assistant", "content" to "Новый ответ 202")) }
        compose.onNodeWithText("Новый ответ 202").assertIsDisplayed()
        compose.onNodeWithTag("chat-messages").performScrollToIndex(0)
        compose.onNodeWithText("Сообщение 1:", substring = true).assertIsDisplayed()
        compose.runOnUiThread { model.messages = model.messages + obj("id" to 203, "role" to "assistant", "content" to "Новое сообщение 203") }
        compose.onNodeWithText("Сообщение 1:", substring = true).assertIsDisplayed()
        val violations = CopyOnWriteArrayList<String>()
        var oldPolicy: StrictMode.ThreadPolicy? = null
        compose.runOnUiThread { oldPolicy = StrictMode.getThreadPolicy(); StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().penaltyListener(context.mainExecutor) { violations += it.toString() }.build()) }
        try {
            compose.onNodeWithText("Сообщение", substring = false).performTextReplacement("Черновик без дисковых операций в UI")
            compose.waitForIdle()
            assertEquals("Черновик без дисковых операций в UI", model.chatDraft())
        } finally { compose.runOnUiThread { StrictMode.setThreadPolicy(oldPolicy!!) } }
        assertTrue(violations.toString(), violations.isEmpty())
        val device = androidx.test.uiautomator.UiDevice.getInstance(instrumentation)
        device.waitForIdle(1000)
        compose.onNodeWithText("AI-помощник", substring = false).assertIsDisplayed()
        val title = device.findObject(androidx.test.uiautomator.By.text("AI-помощник"))
        assertNotNull("The IME must leave the dialog header on screen", title)
        assertTrue("The IME must not pan the header beyond the screen", title.visibleBounds.height() > 0 && title.visibleBounds.top >= 0)
        compose.onNodeWithText("Отправить", substring = false).assertIsDisplayed()
        assertTrue("The IME must leave space to read the conversation", compose.onNodeWithTag("chat-messages").fetchSemanticsNode().boundsInRoot.height >= 80 * context.resources.displayMetrics.density)
        capture("refinement-chat-keyboard")
        LocalDrafts.get(context, account).flush()
        assertEquals("Черновик без дисковых операций в UI", JSONObject(WorkoutDatabase.get(context).drafts().all(localAccountKey(account)).first { it.key == "local:chat-draft:9191" }.json).text("text"))
        compose.onNodeWithText("Закрыть", substring = false).performClick()
        compose.onNodeWithText("Открыть снова").performClick()
        compose.onNodeWithText("Сообщение", substring = false).assertTextContains("Черновик без дисковых операций в UI")
        capture("refinement-chat")
    }
    @Test fun differentScreensHaveIndependentOperationStateAndOfflineStatusIsCompact() {
        compose.setContent { FitApp(model) }
        val first = CompletableDeferred<Unit>(); val second = CompletableDeferred<Unit>()
        try {
            compose.runOnUiThread { model.run { first.await() } }
            assertTrue(model.busy)
            compose.onNodeWithContentDescription(Screen.Programs.title).assertIsEnabled().performClick()
            compose.waitUntil(5000) { model.screen == Screen.Programs && !model.refreshing }
            assertFalse(model.busy)
            compose.runOnUiThread { model.run { second.await() } }
            assertTrue(model.busy)
            compose.onNodeWithTag("open-settings").assertIsEnabled()
            second.complete(Unit); compose.waitUntil(5000) { !model.busy }
            compose.onNodeWithContentDescription(Screen.Workout.title).performClick()
            compose.waitUntil(5000) { model.screen == Screen.Workout && !model.refreshing }
            assertTrue(model.busy)
            compose.onNodeWithText("Нет соединения.", substring = true).assertDoesNotExist()
            compose.onNodeWithContentDescription("Показаны сохранённые данные").assertIsEnabled().performClick()
            compose.onNodeWithText("Показаны данные с устройства.", substring = true).assertIsDisplayed()
            capture("refinement-offline-status")
        } finally { first.complete(Unit); second.complete(Unit) }
    }
    @Test fun finishingAnOldAccountOperationCannotUnlockANewOperation() {
        val old = CompletableDeferred<Unit>(); val fresh = CompletableDeferred<Unit>()
        compose.setContent { Text("Проверка состояний запроса") }
        try {
            compose.runOnUiThread { model.run { old.await() }; model.logout() }
            assertFalse(model.anyBusy)
            compose.runOnUiThread { model.run { fresh.await() } }
            assertTrue(model.busy)
            old.complete(Unit)
            compose.waitForIdle()
            assertTrue(model.busy)
            fresh.complete(Unit)
            compose.waitUntil(5000) { !model.busy }
        } finally { old.complete(Unit); fresh.complete(Unit) }
    }
    @Test fun mainPageAndProgramLibraryUseLazyListsWithStableSelection() {
        val folders = (1..200).map { obj("id" to it, "name" to "Программа $it", "templates" to JSONArray()) }
        compose.runOnUiThread { model.plan = obj("id" to 919191, "date" to model.date, "folders" to JSONArray(folders), "logs" to JSONArray()); model.folders = folders }
        compose.setContent { FitApp(model) }
        val list = compose.onNodeWithTag("page-scroll")
        list.performScrollToNode(hasTestTag("workout-program-200"))
        compose.onNodeWithTag("workout-program-200").assertIsDisplayed()
        assertTrue(compose.onAllNodes(hasTestTag("workout-program-1")).fetchSemanticsNodes().isEmpty())
        capture("refinement-lazy-checklist")
        compose.runOnUiThread { model.screen = Screen.Programs }
        compose.onNodeWithTag("program-library").performScrollTo()
        compose.onNodeWithTag("program-library-list").performScrollToIndex(199)
        compose.onNodeWithTag("select-program-200").performClick()
        compose.onNodeWithTag("program-200").assertExists()
        compose.onNodeWithTag("select-program-1").assertDoesNotExist()
        capture("refinement-program-library")
    }
    @Test fun aPreferenceRefreshDoesNotResetTheWizardFieldsBeingEdited() {
        compose.runOnUiThread { model.screen = Screen.Assistant }
        compose.setContent { FitApp(model) }
        compose.onNodeWithText("Возраст", substring = false).performTextReplacement("41")
        compose.runOnUiThread { model.preferences = obj("design_version" to "v2", "theme" to "light", "age" to 99) }
        compose.onNodeWithText("Возраст", substring = false).assertTextContains("41")
        assertEquals("41", model.assistantAnswers().text("age"))
    }
    @Test fun versionOneDatabaseMigratesWithoutDroppingQueuedResults() = runBlocking<Unit> {
        val name = "migration-${UUID.randomUUID()}.db"
        val schema = JSONObject(instrumentation.context.assets.open("com.fittodoay.android.WorkoutDatabase/1.json").bufferedReader().use { it.readText() }).getJSONObject("database")
        android.database.sqlite.SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(name), null).use { old ->
            schema.getJSONArray("entities").objects().forEach { entity ->
                old.execSQL(entity.getString("createSql").replace("\${TABLE_NAME}", entity.getString("tableName")))
                entity.optJSONArray("indices")?.objects()?.forEach { old.execSQL(it.getString("createSql").replace("\${TABLE_NAME}", entity.getString("tableName"))) }
            }
            val queries = schema.getJSONArray("setupQueries")
            for (i in 0 until queries.length()) old.execSQL(queries.getString(i))
            old.execSQL("INSERT INTO workout_plans VALUES('test','2026-11-21','{}')")
            old.execSQL("INSERT INTO workout_outbox VALUES('test','pending',0,'{}')")
            old.version = 1
        }
        val upgraded = Room.databaseBuilder(context, WorkoutDatabase::class.java, name).build()
        try {
            assertEquals("{}", upgraded.workouts().plan("test", "2026-11-21"))
            assertEquals(1, upgraded.workouts().queue("test").size)
            upgraded.drafts().put(listOf(StoredLocalDraft("test", "draft", "{}")))
            assertEquals(1, upgraded.drafts().all("test").size)
        } finally { upgraded.close(); context.deleteDatabase(name) }
    }
    @Test fun legacyDraftImportIsOneTimeAndWorkerRejectsAnotherAccount() = runBlocking<Unit> {
        val other = "draft-import:${UUID.randomUUID()}"
        val legacy = LocalDataStore(context, other)
        legacy.write("local:chat-draft:7", obj("text" to "Старый черновик"))
        val drafts = LocalDrafts.get(context, other); drafts.awaitReady()
        assertEquals("Старый черновик", drafts.read("local:chat-draft:7")!!.text("text"))
        repeat(50) { drafts.write("local:chat-draft:7", obj("text" to "Новый $it")) }
        drafts.flush()
        assertEquals("Новый 49", JSONObject(WorkoutDatabase.get(context).drafts().all(localAccountKey(other)).first { it.key == "local:chat-draft:7" }.json).text("text"))
        assertNull(LocalDrafts.get(context, account).read("local:chat-draft:7"))
        val request = OneTimeWorkRequestBuilder<ArchiveSyncWorker>().setInputData(workDataOf("account" to localAccountKey(other))).build()
        val manager = WorkManager.getInstance(context)
        manager.enqueue(request).result.get(10, TimeUnit.SECONDS)
        withTimeout(10_000) { while (requireNotNull(manager.getWorkInfoById(request.id).get()).state != WorkInfo.State.SUCCEEDED) delay(100) }
        assertFalse(requireNotNull(manager.getWorkInfoById(request.id).get()).outputData.keyValueMap.containsKey("stage"))
    }
    @Test(timeout = 60_000) fun aDelayedSendDoesNotClearTheNextMessageDraft() = runBlocking<Unit> {
        val posted = java.util.concurrent.CountDownLatch(1)
        val released = java.util.concurrent.CountDownLatch(1)
        val certificate = okhttp3.tls.HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val tls = okhttp3.tls.HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = okhttp3.tls.HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val transport = okhttp3.OkHttpClient.Builder().proxy(java.net.Proxy.NO_PROXY).sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager).build()
        val server = okhttp3.mockwebserver.MockWebServer()
        server.useHttps(tls.sslSocketFactory(), false)
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): okhttp3.mockwebserver.MockResponse {
                val path = request.path.orEmpty()
                if (request.method == "POST" && path.endsWith("/messages/")) {
                    posted.countDown(); check(released.await(10, TimeUnit.SECONDS))
                }
                val result: Any = when {
                    path.startsWith("/api/profile/preferences/") -> obj("design_version" to "v2", "theme" to "light")
                    path.startsWith("/api/workouts/plan/") -> obj("id" to 919191, "date" to java.time.LocalDate.now().toString(), "folders" to JSONArray(), "logs" to JSONArray())
                    request.method == "POST" -> JSONObject()
                    else -> JSONArray()
                }
                return okhttp3.mockwebserver.MockResponse().setHeader("Content-Type", "application/json").setBody(result.toString())
            }
        }
        server.start()
        try {
            val endpoint = server.url("/").toString().trimEnd('/')
            lateinit var sender: AppModel
            compose.runOnUiThread { sender = AppModel(context.applicationContext as Application, endpoint, { true }, transport); models.put("sender", sender) }
            compose.setContent { Text("Изолированный HTTPS-тест черновика") }
            compose.waitUntil(10_000) { !sender.refreshing && !sender.draftLoading }
            compose.runOnUiThread { sender.chatProgram = 9191; sender.threadId = 9192; sender.saveChatDraft("Первое сообщение"); sender.send("Первое сообщение") }
            assertTrue(posted.await(5, TimeUnit.SECONDS))
            compose.runOnUiThread { sender.saveChatDraft("Следующее сообщение уже набрано") }
            released.countDown()
            compose.waitUntil(10_000) { !sender.chatBusy }
            assertNull(sender.error)
            assertEquals("Следующее сообщение уже набрано", sender.chatDraft())
            LocalDrafts.get(context, account).flush()
            assertEquals("Следующее сообщение уже набрано", JSONObject(WorkoutDatabase.get(context).drafts().all(localAccountKey(account)).first { it.key == "local:chat-draft:9191" }.json).text("text"))
        } finally { released.countDown(); server.shutdown() }
    }
}
