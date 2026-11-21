@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)

package com.fittodoay.android

import android.app.Application
import android.os.*
import android.view.FrameMetrics
import android.view.Window
import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.*
import okhttp3.tls.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.util.UUID
import java.util.concurrent.*

/** Actual Compose UI + delayed HTTPS. Only synthetic data reaches the local mock server. */
class FluidWorkoutTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>(effectContext = NoMotion)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var model: AppModel
    private lateinit var server: MockWebServer
    private lateinit var original: String
    private lateinit var account: String
    private val models = ViewModelStore()
    private val released = CountDownLatch(1)
    private val started = CountDownLatch(1)
    private val serverLock = Any()
    private var serverLog: JSONObject? = null
    private var posts = 0; private var patches = 0; private var deletes = 0
    private lateinit var base: JSONObject
    private val frames = ConcurrentLinkedQueue<Long>()
    private val diskViolations = CopyOnWriteArrayList<String>()
    private lateinit var frameThread: HandlerThread
    private var previousPolicy: StrictMode.ThreadPolicy? = null
    private val metrics = Window.OnFrameMetricsAvailableListener { _, frame, _ -> frames += frame.getMetric(FrameMetrics.TOTAL_DURATION) }
    @Before fun prepare() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("fluidWorkout") == "true")
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        original = SessionStore(context).read()
        if (original.startsWith("fluid-workout:") && marker.text("session_digest") != localAccountKey(original)) {
            val backup = JSONObject(File(context.filesDir, "qa-enrolled-session.json").readText())
            check(marker.text("purpose") == "android-native-qa" && backup.text("session_digest") == marker.text("session_digest"))
            check(context.getSharedPreferences("session", android.content.Context.MODE_PRIVATE).edit().putString("token", backup.getString("encrypted_token")).commit())
            original = SessionStore(context).read()
        }
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == localAccountKey(original))
        account = "fluid-workout:${UUID.randomUUID()}"
        val fixture = JSONObject(File(context.filesDir, "visual-reference.json").readText())
        check(fixture.text("account_kind") == "synthetic")
        val reference = normalizePlan(fixture.getJSONObject("plan")).array("folders").first().array("templates").first().array("exercises").first()
        val exercise = JSONObject(reference.toString()).put("template_exercise_id", 91001).put("is_active", true)
            .put("source", obj("name" to "Проверка плавности", "has_weight" to true, "has_time" to false))
            .put("defaults", obj("has_weight" to true, "has_time" to false, "reps" to 10, "weight" to 6.25, "rest" to 600))
            .put("sets", JSONArray().put(obj("set_index" to 1, "default_reps" to 10, "default_weight" to 6.25, "rest" to 600)).put(obj("set_index" to 2, "default_reps" to 10, "default_weight" to 6.25, "rest" to 600)))
        base = obj("id" to 919191, "date" to java.time.LocalDate.now().toString(), "logs" to JSONArray(), "weigh_in" to obj("weight_kg" to 81.25),
            "folders" to JSONArray().put(obj("id" to 9191, "name" to "Синтетический тест", "templates" to JSONArray().put(obj("id" to 9192, "name" to "Тестовый день", "exercises" to JSONArray().put(exercise))))))
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val tls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val transport = OkHttpClient.Builder().proxy(java.net.Proxy.NO_PROXY).sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager).build()
        server = MockWebServer().apply { useHttps(tls.sslSocketFactory(), false); dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                if (path.startsWith("/api/workouts/logs/") && request.method == "POST") {
                    val body = JSONObject(request.body.readUtf8()).put("id", 701)
                    synchronized(serverLock) { serverLog = body; posts++ }
                    started.countDown(); check(released.await(20, TimeUnit.SECONDS))
                    return response(body)
                }
                if (path.startsWith("/api/workouts/logs/") && request.method == "PATCH") {
                    val body = JSONObject(request.body.readUtf8()).put("id", 701)
                    synchronized(serverLock) { serverLog = body; patches++ }; return response(body)
                }
                if (path.startsWith("/api/workouts/logs/") && request.method == "DELETE") {
                    synchronized(serverLock) { serverLog = null; deletes++ }; return MockResponse().setResponseCode(204)
                }
                if (path.startsWith("/api/workouts/plan/")) return response(synchronized(serverLock) { JSONObject(base.toString()).put("logs", JSONArray(listOfNotNull(serverLog))) })
                if (path == "/api/profile/preferences/") return response(obj("design_version" to "v2", "theme" to "light", "accent_color" to "#a855f7", "muscle_summary_view" to "bars"))
                return response(JSONArray())
            }
        }; start() }
        val endpoint = server.url("/").toString().trimEnd('/')
        SessionStore(context).write(account)
        compose.runOnUiThread { model = AppModel(context.applicationContext as Application, endpoint, { true }, transport); models.put("fluid", model) }
        compose.waitUntil(10_000) { !model.refreshing && model.workoutSaving == 0 && model.plan.optInt("id") == 919191 }
        compose.setContent { FitApp(model) }
        frameThread = HandlerThread("fluid-frame-metrics").apply { start() }
        compose.activity.window.addOnFrameMetricsAvailableListener(metrics, Handler(frameThread.looper))
        compose.runOnUiThread {
            previousPolicy = StrictMode.getThreadPolicy()
            StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().penaltyListener(context.mainExecutor) { violation ->
                if (violation.stackTrace.any { it.className in listOf(OfflineStore::class.java.name, TimerStore::class.java.name, LocalDataStore::class.java.name) }) diskViolations += violation.toString()
            }.build())
        }
    }
    private fun response(value: Any) = MockResponse().setHeader("Content-Type", "application/json").setBody(value.toString())
    private fun localIdle() = compose.waitUntil(2000) { model.workoutSaving == 0 }
    private fun beginSlowSave(): Long {
        compose.onNode(hasText("+ Отметить", substring = false) and hasAnyAncestor(hasTestTag("set-row-91001-1"))).performScrollTo().performClick()
        localIdle(); compose.onNodeWithTag("workout-timer-screen").assertIsDisplayed()
        val start = SystemClock.elapsedRealtime()
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick()
        compose.waitUntil(1500) { !model.workoutTimerActive && model.plan.array("logs").size == 1 }
        val elapsed = SystemClock.elapsedRealtime() - start
        assertFalse(model.busy)
        assertTrue("The server must still be held while the checklist is usable", started.await(5, TimeUnit.SECONDS))
        compose.onNodeWithTag("workout-day-toggle-9192")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Развёрнуто"))
        return elapsed
    }
    private fun edit() = compose.onNode(hasContentDescription("Изменить подход 1") and hasAnyAncestor(hasTestTag("set-row-91001-1"))).performScrollTo().performClick()
    private fun report(name: String, elapsed: Long) {
        compose.waitForIdle()
        assertTrue("Workout disk I/O must stay off the UI thread: $diskViolations", diskViolations.isEmpty())
        val samples = frames.toList().sorted(); val p95 = samples.getOrNull((samples.size * .95).toInt().coerceAtMost((samples.size - 1).coerceAtLeast(0))) ?: 0
        val directory = File(context.filesDir, "extended-parity").apply { mkdirs() }
        File(directory, "$name.json").writeText(obj("result" to "passed", "local_completion_ms" to elapsed, "server_response_held" to true,
            "ui_thread_storage_violations" to diskViolations.size, "frame_count" to samples.size, "frame_p95_ms" to p95 / 1_000_000.0,
            "posts" to posts, "patches" to patches, "deletes" to deletes, "source" to "local-https-synthetic-only").toString(2))
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        File(directory, "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    }
    @Test(timeout = 60_000) fun localCompletionAndLaterEditStayResponsiveDuringSlowHttps() {
        compose.onNodeWithContentDescription("Вес, кг").performScrollTo().performTextReplacement("81,9")
        androidx.test.uiautomator.UiDevice.getInstance(instrumentation).pressBack()
        val elapsed = beginSlowSave()
        assertEquals("81,9", compose.onNodeWithContentDescription("Вес, кг").fetchSemanticsNode().config[SemanticsProperties.EditableText].text)
        // Navigation also remains available while POST is waiting on the server.
        compose.onNodeWithContentDescription(Screen.Programs.title).assertIsEnabled().performClick()
        compose.waitUntil(3000) { model.screen == Screen.Programs && !model.refreshing }
        compose.onNodeWithText("Мои программы", substring = false).assertIsDisplayed()
        compose.onNodeWithContentDescription(Screen.Workout.title).performClick()
        compose.waitUntil(3000) { model.screen == Screen.Workout && !model.refreshing }
        edit()
        compose.onNode(hasContentDescription("Повторы") and hasAnyAncestor(hasTestTag("completed-set-dialog"))).performTextReplacement("12")
        compose.onNodeWithText("Сохранить", substring = false).performClick(); localIdle()
        assertEquals(12, model.plan.array("logs").single().getInt("actual_reps"))
        released.countDown()
        compose.waitUntil(8000) { model.pendingCount == 0 && !model.workoutSync.syncing }
        assertEquals(12, model.plan.array("logs").single().getInt("actual_reps"))
        assertEquals(12, synchronized(serverLock) { serverLog!!.getInt("actual_reps") })
        assertEquals(1, posts); assertEquals(1, patches)
        report("fluid-late-edit", elapsed)
    }
    @Test(timeout = 60_000) fun undoDuringInFlightPostCannotResurrectTheSet() {
        val elapsed = beginSlowSave()
        edit(); compose.onNodeWithText("Отменить выполнение", substring = false).performClick(); localIdle()
        assertTrue(model.plan.array("logs").isEmpty())
        assertEquals("DELETE", OfflineStore(context, account).queue().single().text("method"))
        released.countDown()
        compose.waitUntil(8000) { model.pendingCount == 0 && !model.workoutSync.syncing }
        assertTrue(model.plan.array("logs").isEmpty()); assertNull(synchronized(serverLock) { serverLog })
        assertEquals(1, posts); assertEquals(1, deletes)
        report("fluid-inflight-undo", elapsed)
    }
    @After fun restore() {
        released.countDown()
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            val directory = File(context.filesDir, "extended-parity").apply { mkdirs() }
            File(directory, "fluid-last-window.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        }
        if (::original.isInitialized) SessionStore(context).write(original)
        if (::model.isInitialized) compose.runOnUiThread {
            previousPolicy?.let(StrictMode::setThreadPolicy)
            if (::frameThread.isInitialized) { compose.activity.window.removeOnFrameMetricsAvailableListener(metrics); frameThread.quitSafely() }
            model.cancelWorkoutTimer(); SessionStore(context).write(original); model.audio.accountChanged(); models.clear()
        }
        if (::server.isInitialized) server.shutdown()
    }
}
