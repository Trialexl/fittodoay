@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
package com.fittodoay.android

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
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
import java.util.concurrent.CopyOnWriteArrayList

/** Checks actual save/refresh requests against a local TLS server, including reorder failures. */
class PolishNetworkTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>(effectContext = NoMotion)
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var original: String
    private lateinit var model: AppModel
    private lateinit var server: MockWebServer
    private val models = ViewModelStore()
    private val requests = CopyOnWriteArrayList<Pair<String, String>>()
    private val orders = CopyOnWriteArrayList<List<Int>>()
    private var reject = false
    private val holdDays = java.util.concurrent.atomic.AtomicBoolean(false)
    private val daysStarted = java.util.concurrent.CountDownLatch(1)
    private val releaseDays = java.util.concurrent.CountDownLatch(1)
    private lateinit var day: JSONObject
    @Before fun prepare() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("polish") == "true")
        original = SessionStore(context).read()
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == localAccountKey(original))
        SessionStore(context).write("polish-network:${UUID.randomUUID()}")
        day = obj("id" to 5, "folder" to 1, "name" to "День QA", "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray().put(0)),
            "template_exercises" to JSONArray((1..3).map { obj("id" to it, "exercise" to obj("name" to "Упражнение $it", "default_sets" to 3, "default_reps" to 10)) }))
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val tls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val client = OkHttpClient.Builder().proxy(java.net.Proxy.NO_PROXY).sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager).build()
        server = MockWebServer().apply {
            useHttps(tls.sslSocketFactory(), false)
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val path = request.path.orEmpty(); val body = request.body.readUtf8()
                    requests += request.method.orEmpty() to path
                    fun response(value: Any) = MockResponse().setHeader("Content-Type", "application/json").setBody(value.toString())
                    if (path == "/api/programs/template-exercises/reorder/" && request.method == "POST") {
                        val data = JSONObject(body)
                        assertEquals(5, data.getInt("template"))
                        val ids = data.getJSONArray("order").let { a -> (0 until a.length()).map(a::getInt) }
                        orders += ids
                        if (reject) return MockResponse().setResponseCode(400).setHeader("Content-Type", "application/json").setBody("{\"detail\":\"Порядок не сохранён\"}")
                        day.put("template_exercises", JSONArray(ids.map { id -> day.array("template_exercises").first { it.optInt("id") == id } }))
                        return response(obj("status" to "ok"))
                    }
                    if (path == "/api/programs/templates/5/" && request.method == "PATCH") return response(JSONObject(body).put("id", 5))
                    if (path.startsWith("/api/programs/templates/")) return response(JSONArray().put(day))
                    if (path.startsWith("/api/profile/preferences/")) return response(obj("theme" to "light", "design_version" to "v2"))
                    if (path.startsWith("/api/analytics/days/")) {
                        if (holdDays.compareAndSet(true, false)) { daysStarted.countDown(); releaseDays.await(10, java.util.concurrent.TimeUnit.SECONDS) }
                        return response(obj("items" to JSONArray().put(obj("date" to java.time.LocalDate.now().toString(), "load" to if (path.contains("start=${analyticsRangeStart("year")}")) 200 else 100))))
                    }
                    if (path.startsWith("/api/workouts/logs/") && request.method in listOf("POST", "PATCH")) return response(JSONObject(body).put("id", 55))
                    if (path.startsWith("/api/workouts/plan/")) return response(obj("id" to 1, "date" to java.time.LocalDate.now().toString(), "folders" to JSONArray(), "logs" to JSONArray()))
                    if (path.startsWith("/api/analytics/program-trends/")) return response(obj("folders" to JSONArray()))
                    return response(JSONArray())
                }
            }; start()
        }
        val endpoint = server.url("/").toString().trimEnd('/')
        compose.runOnUiThread { model = AppModel(context.applicationContext as Application, endpoint, { true }, client); models.put("model", model) }
        compose.waitUntil(20_000) { !model.refreshing && !model.draftLoading }
        compose.runOnUiThread { model.navigate(Screen.Programs) }
        compose.waitUntil(20_000) { !model.refreshing }
    }
    @After fun restore() {
        releaseDays.countDown()
        if (::model.isInitialized) compose.runOnUiThread { model.audio.stop(); models.clear() }
        if (::server.isInitialized) server.shutdown()
        if (::original.isInitialized) SessionStore(context).write(original)
    }
    @Test fun aDragIsSavedThroughReorderApiAndRemainsAfterReload() {
        var closed = false
        compose.setContent { MaterialTheme(typography = FitTypography) { DayDialog(JSONObject(day.toString()), model) { closed = true } } }
        compose.onNodeWithTag("day-editor-list").performScrollToIndex(1)
        val first = compose.onNodeWithTag("day-order-1").fetchSemanticsNode().boundsInRoot
        val second = compose.onNodeWithTag("day-order-2").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("drag-exercise-1").performTouchInput { swipe(center, center + Offset(0f, second.center.y - first.center.y + 12f), 700) }
        compose.onNodeWithTag("day-order-1").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Позиция 2 из 3"))
        compose.onNodeWithText("Сохранить", substring = false).performClick()
        compose.waitUntil(20_000) { closed && !model.busy }
        assertNull(model.error)
        assertEquals(listOf(listOf(2, 1, 3)), orders.toList())
        assertEquals(listOf(2, 1, 3), model.templates.first().array("template_exercises").map { it.optInt("id") })
    }
    @Test fun aRejectedReorderKeepsTheEditorOpenAndCanBeRetried() {
        reject = true
        var closed = false
        val fields = obj("name" to "День QA", "folder" to 1)
        compose.runOnUiThread { model.saveDay(day, fields, listOf(3, 1, 2)) { closed = true } }
        compose.waitUntil(20_000) { !model.busy }
        assertFalse(closed); assertNotNull(model.error)
        reject = false
        compose.runOnUiThread { model.saveDay(day, fields, listOf(3, 1, 2)) { closed = true } }
        compose.waitUntil(20_000) { closed && !model.busy }
        assertNull(model.error)
        assertEquals(listOf(3, 1, 2), model.templates.first().array("template_exercises").map { it.optInt("id") })
    }
    @Test fun yearSelectionAppliesToSummaryWeightAndExerciseRequests() {
        requests.clear()
        compose.runOnUiThread { model.range = "year"; model.navigate(Screen.Analytics) }
        compose.waitUntil(20_000) { !model.refreshing }
        assertNull(model.error)
        val period = analyticsRangeQuery("year")
        for (route in listOf("days", "body-weight", "exercises")) assertTrue("Range missing from $route", requests.any { it == "GET" to "/api/analytics/$route/?$period" })
        assertTrue(requests.any { it == "GET" to "/api/analytics/program-trends/?range=year&granularity=day" })
    }
    @Test fun aLateCalendarResponseDoesNotRollBackAnAlreadyAcknowledgedEdit() {
        val date = java.time.LocalDate.now().toString()
        val oldLog = obj("id" to 55, "workout_day" to 77, "template_exercise" to 3, "set_index" to 1, "actual_reps" to 10, "actual_weight" to 10)
        val plan = obj("id" to 77, "date" to date, "logs" to JSONArray().put(oldLog), "folders" to JSONArray())
        kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO) { OfflineStore(context, model.token).cache(date, plan) }
        compose.runOnUiThread { model.plan = plan }
        holdDays.set(true)
        compose.setContent { MaterialTheme(typography = FitTypography) { WorkoutCalendar(model) {} } }
        compose.waitUntil(5000) { daysStarted.count == 0L }
        compose.runOnUiThread { model.logSet(obj("template_exercise_id" to 3, "defaults" to obj("has_weight" to true)), obj("set_index" to 1), "6", "20", "", oldLog) }
        compose.waitUntil(10_000) { model.workoutSaving == 0 && model.pendingCount == 0 && model.plan.array("logs").singleOrNull()?.let { it.optInt("actual_reps") == 6 && !it.optBoolean("queued") } == true }
        releaseDays.countDown()
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("calendar-loading").fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithTag("calendar-load-$date", useUnmergedTree = true).assertTextEquals("120")
    }
    @Test fun changingThePeriodDuringALoadCancelsTheOldSelection() {
        holdDays.set(true)
        compose.runOnUiThread { model.navigate(Screen.Analytics) }
        compose.setContent { MaterialTheme(typography = FitTypography) { AnalyticsScreen(model) } }
        compose.waitUntil(5000) { daysStarted.count == 0L }
        compose.onNodeWithContentDescription("Период").performClick()
        compose.onNode(hasText("Год", substring = false) and hasAnyAncestor(isPopup())).performClick()
        compose.waitUntil(15_000) { model.range == "year" && !model.refreshing }
        releaseDays.countDown()
        compose.waitForIdle()
        assertEquals("year", model.range)
        assertEquals(200, model.days.single().getInt("load"))
    }
}
