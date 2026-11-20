package com.fittodoay.android

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.semantics.SemanticsActions
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.time.LocalDate
import java.util.UUID
import java.security.MessageDigest

/** Opt-in only: creates synthetic data in a separate account, never in an existing user account. */
class LiveServerSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val report = JSONObject()
    private fun digest(token: String) = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }
    private lateinit var model: AppModel
    private fun visibleText(text: String) = visibleNode(hasText(text, substring = false), text)
    private fun visibleNode(matcher: SemanticsMatcher, label: String): SemanticsNodeInteraction {
        repeat(20) {
            val candidates = compose.onAllNodes(matcher)
            val count = candidates.fetchSemanticsNodes().size
            for (index in 0 until count) if (candidates[index].isDisplayed()) return candidates[index]
            val page = compose.onNodeWithTag("page-scroll")
            val distance = page.fetchSemanticsNode().boundsInRoot.height * 0.6f
            page.performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, distance) }
            compose.waitForIdle()
        }
        error("Node did not become visible: $label")
    }
    private fun waitForRequest() {
        compose.waitForIdle()
        compose.waitUntil(200_000) { !model.busy }
        compose.waitForIdle()
        assertNull("Native request failed: ${model.error}", model.error)
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        val dir = File(context.filesDir, "qa-artifacts").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        report.put("screen_$name", "captured")
        File(dir, "report.json").writeText(report.toString(2))
    }
    private fun navigate(screen: Screen) {
        QaHarness(compose).also { it.model = model; it.navigate(screen) }
        capture(screen.name.lowercase())
    }

    @Test fun separateTestAccountExercisesLiveServerAndNativeScreens() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("liveServer") == "true")
        compose.runOnIdle { model = compose.activity.model }
        val markerFile = File(context.filesDir, "qa-account.json")
        val api = Api { SessionStore(context).read() }
        if (SessionStore(context).read().isEmpty()) {
            val email = "android-qa-${UUID.randomUUID().toString().take(10)}@example.invalid"
            val password = UUID.randomUUID().toString() + "Aa1!"
            val anonymous = Api { "" }
            val registration = obj("email" to email, "password" to password, "profile" to obj(
                "goal" to "strength", "gender" to "other", "age" to 30, "weight_kg" to 80,
                "height_cm" to 180, "level" to "beginner", "equipment" to "Гантели; тестовые данные Android QA",
                "health_limitations" to "", "preferred_schedule_notes" to "Синтетический аккаунт для проверки приложения"))
            val account = try { anonymous.call("/api/auth/register/", "POST", registration) as JSONObject }
            catch (error: java.io.IOException) {
                if (error is ApiException) throw error
                // A lost registration response can mean the account already exists. Authenticate once;
                // never repeat registration or create a second identity to mask a failed request.
                anonymous.call("/api/auth/login/", "POST", obj("email" to email, "password" to password)) as JSONObject
            }
            markerFile.writeText(obj("email" to email, "purpose" to "android-native-qa", "session_digest" to digest(account.getString("token"))).toString())
            compose.onNodeWithText("Email").performTextInput(email)
            compose.onNodeWithText("Пароль").performTextInput(password)
            compose.onNodeWithText("Войти").performScrollTo().performClick()
            compose.waitUntil(200_000) { model.token.isNotEmpty() && !model.busy }
            waitForRequest()
        } else {
            check(markerFile.exists()) { "An existing non-QA session is present; refusing to modify its data" }
            val existingMarker = JSONObject(markerFile.readText())
            check(existingMarker.text("purpose") == "android-native-qa")
            if (!existingMarker.has("session_digest")) {
                check(InstrumentationRegistry.getArguments().getString("adoptLegacyQaMarker") == "true") { "Legacy QA marker requires explicit enrollment" }
                existingMarker.put("session_digest", digest(SessionStore(context).read()))
                markerFile.writeText(existingMarker.toString())
            }
            check(existingMarker.text("session_digest") == digest(SessionStore(context).read())) { "The current session is not the enrolled QA account" }
            waitForRequest()
        }
        val marker = JSONObject(markerFile.readText())
        report.put("account", marker.text("email"))
        val date = LocalDate.now().toString()
        report.put("date", date)
        val folders = api.call("/api/programs/folders/").rows()
        val folder = folders.find { it.text("name") == "Android QA" } ?: api.call("/api/programs/folders/", "POST",
            obj("name" to "Android QA", "comment" to "Тест нативного приложения; синтетические данные", "is_active" to true)) as JSONObject
        report.put("program_id", folder.getInt("id"))
        QaHarness(compose).also { it.model = model; it.ensureV2() }
        val templates = api.call("/api/programs/templates/?folder=${folder.getInt("id")}").rows()
        if (templates.isEmpty()) {
            val exercise = api.call("/api/exercises/").rows().first { it.optBoolean("has_weight") && !it.optBoolean("has_time") }
            api.call("/api/programs/templates/", "POST", obj("folder" to folder.getInt("id"), "name" to "QA · день тренировки",
                "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray((0..6).toList())),
                "is_active" to true, "template_exercises" to JSONArray().put(obj("exercise_id" to exercise.get("id"),
                    "set_override" to 2, "rep_override" to 10, "weight_override" to 5, "rest_override" to 5))))
        }
        val snapshot = normalizePlan(api.call("/api/workouts/plan/?date=$date") as JSONObject)
        val plannedFolder = snapshot.array("folders").first { it.optInt("id") == folder.getInt("id") }
        val plannedExercise = plannedFolder.array("templates").first().array("exercises").first()
        val exerciseName = plannedExercise.getJSONObject("source").getString("name")
        report.put("exercise", exerciseName)
        compose.runOnIdle { model.refresh() }; waitForRequest()
        capture("workout-before")
        if (compose.onAllNodesWithText("+ Отметить").fetchSemanticsNodes().isNotEmpty()) {
            visibleText("+ Отметить").assertIsEnabled().performClick()
            waitForRequest()
            report.put("after_click_rest", model.restUntil)
            report.put("after_click_logs", model.plan.array("logs").size)
            report.put("after_click_error", model.error ?: "")
            capture("after-set-click")
            compose.waitUntil(10_000) { model.restUntil > 0 }
            compose.onNodeWithText("Восстановление").assertIsDisplayed()
            capture("rest-timer")
            compose.onNodeWithText("Пропустить отдых").performScrollTo().performClick(); waitForRequest()
        }
        val afterLog = normalizePlan(api.call("/api/workouts/plan/?date=$date") as JSONObject)
        assertTrue(afterLog.array("logs").isNotEmpty())
        report.put("saved_sets", afterLog.array("logs").size)
        // Analytics is bounded by the server's UTC date. A Moscow-midnight UI
        // workout can be tomorrow there; seed a completed UTC day explicitly.
        val historyDate = LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1).toString()
        val history = normalizePlan(api.call("/api/workouts/plan/?date=$historyDate") as JSONObject)
        val historyExercise = history.array("folders").first { it.optInt("id") == folder.getInt("id") }
            .array("templates").first().array("exercises").first()
        if (history.array("logs").none { it.optInt("template_exercise") == historyExercise.getInt("template_exercise_id") && it.optInt("set_index") == 1 }) {
            api.call("/api/workouts/logs/", "POST", setLogPayload(history.getInt("id"), historyExercise, 1, "10", "5", ""))
        }
        report.put("analytics_fixture_date", historyDate)
        report.put("analytics_fixture_source", "synthetic_api_setup")
        compose.onAllNodesWithText("Вес, кг", substring = false).onFirst().performScrollTo().performTextClearance()
        compose.onAllNodesWithText("Вес, кг", substring = false).onFirst().performTextInput("80.5")
        compose.onNodeWithContentDescription("Сохранить вес").performScrollTo().performClick(); waitForRequest()
        val weighIn = api.call("/api/workouts/weigh-in/?date=$date") as JSONObject
        assertEquals(80.5, weighIn.getDouble("weight_kg"), 0.001)
        report.put("weight_kg", 80.5)
        capture("workout-after")
        navigate(Screen.Programs)
        QaHarness(compose).also { it.model = model; it.selectProgram(folder.getInt("id")) }
        compose.onNode(hasText("Android QA", substring = false) and hasAnyAncestor(hasTestTag("program-${folder.getInt("id")}"))).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(exerciseName).performScrollTo().assertIsDisplayed()
        navigate(Screen.Analytics)
        assertTrue(api.call("/api/analytics/days/").rows().any { it.optDouble("load", 0.0) > 0 })
        report.put("analytics_has_load", true)
        navigate(Screen.Technique)
        compose.onNodeWithText("Выбрать видео").performScrollTo().assertIsDisplayed()
        navigate(Screen.Settings)
        compose.onNodeWithText("Тёмная").performClick(); waitForRequest()
        assertEquals("dark", (api.call("/api/profile/preferences/") as JSONObject).text("theme"))
        capture("settings-dark")
        compose.onNodeWithText("Светлая").performClick(); waitForRequest()
        navigate(Screen.Assistant)
        compose.onNodeWithText("Создать программу с помощником").assertIsDisplayed()
        navigate(Screen.Programs)
        QaHarness(compose).also { it.model = model; it.selectProgram(folder.getInt("id")) }
        visibleNode(hasText("AI", substring = false) and hasAnyAncestor(hasTestTag("program-${folder.getInt("id")}")), "AI for QA program").performClick(); waitForRequest()
        compose.onNodeWithText("Сообщение", substring = false).performTextInput("Это проверка Android-клиента. Кратко перечисли упражнения программы. Не предлагай и не применяй изменения.")
        compose.onNodeWithText("Отправить").performClick()
        compose.waitUntil(200_000) { !model.busy }
        compose.waitForIdle()
        if (model.error == null) {
            assertTrue(model.messages.any { it.text("role") == "assistant" && it.text("content").isNotBlank() })
            val assistantReply = model.messages.last { it.text("role") == "assistant" }.text("content")
            compose.onNodeWithText(assistantReply).assertIsDisplayed()
            report.put("ai_chat", "responded")
        } else {
            report.put("ai_chat", "unavailable"); report.put("ai_message", model.error)
            compose.onNodeWithText(model.error!!).assertIsDisplayed()
        }
        capture("ai-chat")
        compose.onNodeWithText("Закрыть", substring = false).performClick()
        compose.runOnIdle { model.error = null }
        navigate(Screen.Workout)
        report.put("result", "passed")
        File(context.filesDir, "qa-artifacts/live-server-report.json").writeText(report.toString(2))
        println("Live QA account: ${marker.text("email")}; program ${folder.getInt("id")}; AI ${report.text("ai_chat")}")
    }
}
