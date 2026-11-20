package com.fittodoay.android

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.semantics.SemanticsActions
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.security.MessageDigest

/** Explicitly opted-in integration suite, bound to the previously enrolled synthetic QA session. */
class NativeParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var model: AppModel
    private val api get() = Api { SessionStore(context).read() }
    @Before fun guardAccount() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("parity") == "true")
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        val digest = MessageDigest.getInstance("SHA-256").digest(SessionStore(context).read().toByteArray()).joinToString("") { "%02x".format(it) }
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == digest) { "Not the enrolled synthetic account" }
        compose.runOnIdle { model = compose.activity.model }; waitRequest()
        QaHarness(compose).also { it.model = model; it.ensureV2() }
        compose.runOnIdle { model.restUntil = 0; model.executionUntil = 0 }
    }
    private fun waitRequest() { compose.waitForIdle(); compose.waitUntil(200_000) { !model.busy }; compose.waitForIdle(); assertNull(model.error, model.error) }
    private fun navigate(screen: Screen) {
        check(model.preferences.text("design_version") == "v2")
        compose.onNodeWithContentDescription(screen.title).performClick(); waitRequest()
    }
    private fun visible(text: String): SemanticsNodeInteraction {
        fun candidate(): SemanticsNodeInteraction? {
            val nodes = compose.onAllNodesWithText(text, substring = false)
            for (i in nodes.fetchSemanticsNodes().indices) if (nodes[i].isDisplayed()) return nodes[i]
            return null
        }
        candidate()?.let { return it }
        compose.onNodeWithTag("page-scroll").performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, -100_000f) }
        repeat(80) { candidate()?.let { return it }
            val page = compose.onNodeWithTag("page-scroll"); val distance = page.fetchSemanticsNode().boundsInRoot.height * 0.6f
            page.performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, distance) }; compose.waitForIdle()
        }
        capture("missing-${text.hashCode()}")
        error("Not visible: $text")
    }
    private fun capture(name: String) {
        compose.waitForIdle(); InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        val dir = File(context.filesDir, "parity-artifacts").apply { mkdirs() }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    }
    @Test fun serverPreferenceCapabilities() = runBlocking<Unit> {
        val before = api.call("/api/profile/preferences/") as JSONObject
        val report = obj("keys" to org.json.JSONArray(before.keys().asSequence().toList()), "before_muscles" to before.text("muscle_summary_view"), "before_design" to before.text("design_version"))
        try {
            for (mode in listOf("chips", "bars", "row")) {
                val after = api.call("/api/profile/preferences/", "PUT", obj("muscle_summary_view" to mode)) as JSONObject
                report.put("requested_$mode", after.text("muscle_summary_view", "MISSING"))
            }
        } finally {
            api.call("/api/profile/preferences/", "PUT", before)
            File(context.filesDir, "parity-artifacts/server-capabilities.json").apply { parentFile?.mkdirs() }.writeText(report.toString(2))
        }
    }
    @Test fun appearanceMusclesExerciseStatisticsAndMcp() = runBlocking<Unit> {
        val saved = api.call("/api/profile/preferences/") as JSONObject
        try {
            for (design in listOf("v2")) {
                navigate(Screen.Settings)
                visible("Современный").performClick(); waitRequest()
                assertEquals(design, (api.call("/api/profile/preferences/") as JSONObject).text("design_version"))
                capture("appearance-$design")
                for ((mode, label) in listOf("chips" to "Плашки", "bars" to "Виджет", "row" to "Строка")) {
                    visible(label).performClick(); waitRequest()
                    assertEquals(mode, model.preferences.text("muscle_summary_view"))
                    navigate(Screen.Workout)
                    val muscles = summarizeMuscles(model.plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }, model.plan.array("logs"))
                    assertTrue(muscles.isNotEmpty())
                    if (mode == "row") { capture("row-before-expand-$design"); visible("Группы мышц · ${muscles.size} ▾").performClick() }
                    capture("workout-$design-$mode"); navigate(Screen.Settings)
                }
            }
            visible("Скопировать адрес").performClick()
            compose.onNodeWithText("Скопировано").assertExists(); capture("mcp")
            navigate(Screen.Workout); QaHarness(compose).visible(hasContentDescription("Техника и описание"), "exercise details").performClick()
            compose.onNodeWithText("Статистика", substring = false).performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("chart-load").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("chart-load").performTouchInput { click(center) }
            capture("exercise-statistics"); compose.onNodeWithText("Средний вес").performClick(); capture("exercise-average-weight")
            compose.onNodeWithText("Закрыть", substring = false).performClick()
        } finally {
            api.call("/api/profile/preferences/", "PUT", saved)
            compose.runOnIdle { model.refresh() }; waitRequest()
        }
    }
    @Test fun timerSnapshotRestoresAfterActivityAndViewModelRecreation() {
        val end = System.currentTimeMillis() + 60_000
        compose.runOnIdle { model.restDuration = 60; model.restUntil = end }
        compose.onNodeWithText("Время восстановиться").assertIsDisplayed()
        capture("timer-before-recreation")
        compose.runOnIdle { compose.activity.viewModelStore.clear() }
        compose.activityRule.scenario.recreate()
        compose.runOnIdle { model = compose.activity.model }; waitRequest()
        assertEquals(end, model.restUntil); compose.onNodeWithText("Время восстановиться").assertIsDisplayed()
        capture("timer-restored"); compose.onNodeWithText("Продолжить тренировку").performClick()
        assertNull(TimerStore(context, model.token).read("rest"))
    }
    private fun network(enabled: Boolean) {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val action = if (enabled) "enable" else "disable"
        for (service in listOf("wifi", "data")) android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("svc $service $action")).use { it.readBytes() }
        if (enabled) {
            val avd = android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("getprop ro.boot.qemu.avd_name")).use { it.readBytes().toString(Charsets.UTF_8).trim() }
            if (avd.startsWith("fitTODOay")) {
                android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("cmd wifi connect-network AndroidWifi open")).use { it.readBytes() }
            }
        }
        val connectivity = context.getSystemService(android.net.ConnectivityManager::class.java)
        compose.waitUntil(30_000) { val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
            if (enabled) capabilities?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true else capabilities == null }
    }
    @Test fun offlineBodyWeightSurvivesRecreationAndUpsertsOnce() = runBlocking<Unit> {
        navigate(Screen.Workout)
        val date = model.date
        val previous = model.plan.getJSONObject("weigh_in").getDouble("weight_kg")
        try {
            network(false)
            compose.onNode(hasText("Вес, кг", substring = false) and hasAnyAncestor(hasTestTag("body-weight-panel"))).performScrollTo().performTextReplacement("81,1")
            QaHarness(compose).visible(hasContentDescription("Сохранить вес"), "save weight").performClick(); waitRequest()
            assertTrue(model.pendingCount > 0)
            compose.runOnIdle { compose.activity.viewModelStore.clear() }; compose.activityRule.scenario.recreate()
            compose.runOnIdle { model = compose.activity.model }; waitRequest()
            assertEquals(81.1, model.plan.getJSONObject("weigh_in").getDouble("weight_kg"), .001)
            network(true); compose.runOnIdle { model.refresh() }; waitRequest()
            compose.waitUntil(180_000) { model.pendingCount == 0 && !model.busy }
            val saved = normalizePlan(api.call("/api/workouts/plan/?date=$date") as JSONObject)
            assertEquals(81.1, saved.getJSONObject("weigh_in").getDouble("weight_kg"), .001)
            val rows = api.call("/api/analytics/body-weight/?start=$date&end=$date").rows().filter { it.text("date") == date && !it.isNull("weight_kg") }
            assertEquals(1, rows.size)
            File(context.filesDir, "parity-artifacts/offline-weight.json").writeText(obj("result" to "passed", "durable_weight" to true, "no_duplicates" to true).toString(2))
        } finally {
            network(true)
            OfflineStore(context, model.token).remove("weight:$date")
            api.call("/api/workouts/weigh-in/", "PUT", obj("date" to date, "weight_kg" to previous))
            compose.runOnIdle { model.refresh() }; waitRequest()
        }
    }
    @Test fun offlineEditsPersistAndSynchronizeWithoutDuplicateSets() = runBlocking<Unit> {
        navigate(Screen.Workout)
        val initial = model.plan
        val exercise = initial.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }.first()
        val set = exercise.array("sets").first()
        val existing = initial.array("logs").first { it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index") }
        val originalReps = existing.text("actual_reps")
        val originalWeight = existing.text("actual_weight")
        try {
            network(false)
            compose.runOnIdle { model.logSet(exercise, set, "11", originalWeight, "0", existing) }; waitRequest()
            assertTrue(model.pendingCount > 0)
            compose.runOnIdle { compose.activity.viewModelStore.clear() }; compose.activityRule.scenario.recreate()
            compose.runOnIdle { model = compose.activity.model }; waitRequest()
            assertTrue(model.pendingCount > 0); capture("offline-restored")
            network(true); compose.runOnIdle { model.refresh() }; waitRequest()
            compose.waitUntil(180_000) { model.pendingCount == 0 && !model.busy }
            val after = normalizePlan(api.call("/api/workouts/plan/?date=${model.date}") as JSONObject)
            assertEquals(initial.array("logs").size, after.array("logs").size)
            assertEquals(11, after.array("logs").first { it.optInt("id") == existing.optInt("id") }.getInt("actual_reps"))
            assertEquals(0, model.pendingCount); capture("offline-synchronized")
        } finally {
            network(true)
            compose.runOnIdle { model.refresh() }; waitRequest()
            api.call("/api/workouts/logs/${existing.getInt("id")}/", "PATCH", obj("actual_reps" to originalReps.toInt(), "actual_weight" to originalWeight.toDouble()))
            compose.runOnIdle { model.refresh() }; waitRequest()
        }
    }
}
