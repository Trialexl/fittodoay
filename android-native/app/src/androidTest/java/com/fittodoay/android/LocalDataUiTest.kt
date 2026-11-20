package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.time.LocalDate
import java.util.UUID

/** Host disables the network and really kills the app between prepare and verify. */
class LocalDataUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun phase(value: String) = assumeTrue(InstrumentationRegistry.getArguments().getString("localDataPhase") == value)
    private fun assertOffline() {
        val manager = context.getSystemService(android.net.ConnectivityManager::class.java)
        assertNull("This synthetic token must never reach the network", manager.activeNetwork)
    }
    @Test fun prepareLocalAccount() {
        phase("prepare"); assertOffline()
        val qa = QaHarness(compose); qa.guard(requireNetwork = false)
        val fixture = JSONObject(File(context.filesDir, "visual-reference.json").readText())
        check(fixture.text("source") == "recorded-server-responses" && fixture.text("account_kind") == "synthetic")
        // The original host fixture serialized a one-element template collection
        // as an object. Restore its collection shape before storing API responses.
        if (fixture.optJSONObject("templates")?.has("id") == true) fixture.put("templates", JSONArray().put(fixture.getJSONObject("templates")))
        val testToken = "local-ui-test:${UUID.randomUUID()}"
        val store = LocalDataStore(context, testToken)
        val date = LocalDate.now().toString()
        store.write("/api/profile/preferences/", JSONObject(fixture.getJSONObject("preferences").toString()).put("design_version", "v2"))
        for ((path, key) in listOf("/api/profile/" to "profile", "/api/programs/folders/" to "folders", "/api/programs/templates/" to "templates",
            "/api/analytics/days/" to "days", "/api/analytics/body-weight/" to "weights", "/api/analytics/exercises/" to "exerciseStats")) store.write(path, fixture.get(key))
        store.write("/api/workouts/plan/?date=$date", JSONObject(fixture.getJSONObject("plan").toString()).put("date", date))
        store.write("/api/analytics/program-trends/?range=month&granularity=day", fixture.getJSONObject("trends"))
        store.write("/api/technique-reviews/", JSONArray().put(obj("id" to 98765, "status" to "completed", "video_filename" to "qa-local.mp4", "summary" to "Локальный разбор QA", "result_json" to JSONObject())))
        val template = fixture.get("templates").rows().first { it.array("template_exercises").isNotEmpty() }
        val program = template.getInt("folder")
        val exercise = template.array("template_exercises").first().getJSONObject("exercise")
        store.write("/api/exercises/", JSONArray().put(exercise))
        store.write("local:chat:$program", obj("id" to 987654, "program" to program))
        store.write("local:threads", JSONArray().put(obj("id" to 987654, "program" to program, "title" to "Current QA", "created_at" to "2026-11-20"))
            .put(obj("id" to 987653, "program" to program, "title" to "Previous QA", "created_at" to "2026-11-19")))
        store.write("/api/llm-agent/threads/987653/messages/", JSONArray().put(obj("id" to 2, "role" to "assistant", "content" to "Предыдущий диалог QA", "actions" to JSONArray(), "proposal_status" to "none")))
        store.write("/api/llm-agent/threads/987654/messages/", JSONArray().put(obj("id" to 1, "role" to "assistant", "content" to "Локальная история QA", "actions" to JSONArray(), "proposal_status" to "none")))
        val temporary = File.createTempFile("qa-old-video", ".mp4", context.cacheDir)
        InstrumentationRegistry.getInstrumentation().context.assets.open("qa-technique.mp4").use { input -> temporary.outputStream().use { input.copyTo(it) } }
        val original = LocalMediaStore(context, testToken).preserveVideo("old-review:98765", temporary, "video/mp4")
        temporary.delete()
        store.write("local:video:98765", obj("file" to original.name, "media_key" to "old-review:98765"))
        store.write("local:chat-draft:$program", obj("text" to "Черновик без сети"))
        store.write("local:preview", obj("draft_id" to "local-only-test", "plan" to obj("programs" to JSONArray())))
        File(context.filesDir, "local-ui-account.json").writeText(obj("purpose" to "local-data-ui-test", "digest" to localAccountKey(testToken), "program" to program).toString())
        compose.runOnIdle { qa.model.pauseLocalSync(); SessionStore(context).write(testToken); compose.activity.viewModelStore.clear() }
        compose.activityRule.scenario.recreate()
        compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest()
        assertEquals("v2", qa.model.preferences.text("design_version"))
        assertTrue(qa.model.plan.array("folders").isNotEmpty())
        qa.capture("local-data-before-process-death")
    }
    @Test fun verifyEveryV2SectionAfterProcessDeath() {
        phase("verify"); assertOffline()
        val marker = JSONObject(File(context.filesDir, "local-ui-account.json").readText())
        check(marker.text("purpose") == "local-data-ui-test" && marker.text("digest") == localAccountKey(SessionStore(context).read()))
        val qa = QaHarness(compose); compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest()
        assertEquals("v2", qa.model.preferences.text("design_version"))
        for (screen in Screen.entries) {
            qa.navigate(screen)
            compose.onNodeWithTag("page-scroll").assertIsDisplayed()
            qa.capture("local-data-offline-${screen.name.lowercase()}")
            when (screen) {
                Screen.Workout -> assertTrue(qa.model.plan.array("folders").isNotEmpty())
                Screen.Programs -> assertTrue(qa.model.templates.isNotEmpty())
                Screen.Analytics -> assertTrue(qa.model.days.isNotEmpty() && qa.model.trends.length() > 0)
                Screen.Technique -> {
                    assertEquals("Локальный разбор QA", qa.model.reviews.single().text("summary"))
                    qa.visible("Смотреть видео").performClick(); qa.waitRequest()
                    qa.visible("Закрыть видео").assertIsDisplayed()
                    qa.capture("local-data-offline-video")
                    qa.visible("Закрыть видео").performClick()
                }
                Screen.Settings -> assertTrue(qa.model.profile.length() > 0)
                Screen.Assistant -> {
                    compose.onNodeWithText("Проверьте программу", substring = false).assertExists()
                    qa.visible("Изменить ответы").performClick()
                    assertNull(LocalDataStore(context, SessionStore(context).read()).read("local:preview"))
                }
                else -> Unit
            }
        }
        qa.visible("Данные на устройстве").assertIsDisplayed()
        qa.visible("Обновить локальную копию").performClick()
        compose.onNodeWithText("Нет подключения. Сохранённые данные доступны без интернета.", substring = false).assertExists()
        qa.capture("local-data-offline-storage-status")
        qa.navigate(Screen.Programs); qa.selectProgram(marker.getInt("program"))
        qa.visible(hasText("AI", substring = false) and hasAnyAncestor(hasTestTag("program-${marker.getInt("program")}")), "offline chat").performClick(); qa.waitRequest()
        compose.onNodeWithText("Локальная история QA", substring = false).assertIsDisplayed()
        compose.onNodeWithText("Сообщение", substring = false).assertTextContains("Черновик без сети")
        qa.capture("local-data-offline-chat")
        qa.visible("История диалогов (2)").performClick()
        qa.visible(hasText("Previous QA", substring = true), "previous conversation").performClick(); qa.waitRequest()
        compose.onNodeWithText("Предыдущий диалог QA", substring = false).assertIsDisplayed()
        assertEquals(987653, qa.model.threadId)
        qa.capture("local-data-offline-old-chat")
        compose.onNodeWithText("Закрыть", substring = false).performClick()
        compose.runOnIdle { qa.model.screen = Screen.Workout; qa.model.date = LocalDate.now().plusYears(1).toString(); qa.model.refresh() }
        qa.waitRequest(allowError = true)
        assertTrue(qa.model.plan.array("folders").isEmpty())
        assertTrue(qa.model.error.orEmpty().contains("ещё не сохранены"))
        qa.capture("local-data-not-downloaded-date")
        val localTestToken = SessionStore(context).read()
        compose.runOnIdle {
            qa.model.customExercises = listOf(obj("name" to "Private QA exercise"))
            qa.model.recommendations = listOf(obj("name" to "Private QA recommendation"))
            qa.model.logout()
            // Keep this synthetic session for the host's guarded recovery phase.
            SessionStore(context).write(localTestToken)
        }
        assertTrue(qa.model.customExercises.isEmpty() && qa.model.catalog.isEmpty() && qa.model.recommendations.isEmpty())
        qa.report("local-data-process", obj("result" to "passed", "network_enabled" to false, "process_restarted" to true, "routes" to 6, "chat_and_draft" to true, "design" to "v2"))
    }
    @Test fun restoreEnrolledSession() {
        phase("restore"); assertOffline()
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        val backup = JSONObject(File(context.filesDir, "qa-enrolled-session.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == backup.text("session_digest"))
        val current = localAccountKey(SessionStore(context).read())
        val localMarker = File(context.filesDir, "local-ui-account.json").takeIf { it.exists() }?.let { JSONObject(it.readText()) }
        check(current == marker.text("session_digest") ||
            localMarker?.text("purpose") == "local-data-ui-test" && current == localMarker.text("digest")) {
            "Refusing to replace a session unrelated to this synthetic local-data test"
        }
        compose.runOnIdle {
            compose.activity.model.pauseLocalSync()
            check(context.getSharedPreferences("session", android.content.Context.MODE_PRIVATE).edit().putString("token", backup.getString("encrypted_token")).commit())
        }
        assertEquals(marker.text("session_digest"), localAccountKey(SessionStore(context).read()))
    }
}
