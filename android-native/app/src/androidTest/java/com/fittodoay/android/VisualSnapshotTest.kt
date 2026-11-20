package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File

/** Visual inspection only: actual recorded QA API responses, with emulator networking off. */
class VisualSnapshotTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun captureRecordedServerDataAndCheckCompactSetEditor() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("visualSnapshot") == "true")
        val layout = InstrumentationRegistry.getArguments().getString("layoutName") ?: "reference"
        val suffix = if (layout == "reference") "" else "-$layout"
        val qa = QaHarness(compose); qa.guard(requireNetwork = false); qa.waitRequest(allowError = true)
        val fixture = JSONObject(File(qa.context.filesDir, "visual-reference.json").readText())
        check(fixture.text("source") == "recorded-server-responses" && fixture.text("account_kind") == "synthetic")
        check(qa.model.pendingCount == 0) { "Synchronize the enrolled QA account before visual capture" }
        val originalPreferences = qa.model.preferences
        try {
            compose.runOnIdle {
                qa.model.error = null; qa.model.notice = null
                qa.model.plan = normalizePlan(fixture.getJSONObject("plan")); qa.model.date = qa.model.plan.text("date")
                qa.model.folders = fixture.get("folders").rows(); qa.model.templates = fixture.get("templates").rows()
                qa.model.profile = fixture.getJSONObject("profile"); qa.model.tracks = fixture.get("tracks").rows()
                qa.model.reviews = fixture.get("reviews").rows(); qa.model.days = fixture.get("days").rows()
                qa.model.weights = fixture.get("weights").rows(); qa.model.exerciseStats = fixture.get("exerciseStats").rows()
                qa.model.trends = fixture.getJSONObject("trends")
                qa.model.restUntil = 0; qa.model.executionUntil = 0
            }
            for (design in listOf("v2")) {
                compose.runOnIdle { qa.model.preferences = JSONObject(fixture.getJSONObject("preferences").toString())
                    .put("design_version", design).put("theme", "light").put("accent_color", "#a855f7") }
                for (screen in Screen.entries) {
                    compose.runOnIdle { qa.model.screen = screen }
                    compose.mainClock.advanceTimeBy(250)
                    compose.waitForIdle()
                    val heading = when (screen) {
                        Screen.Workout -> "Тренировка"
                        Screen.Programs -> "Мои программы"
                        Screen.Analytics -> "Прогресс и рекомендации"
                        Screen.Technique -> "Проверка техники"
                        Screen.Assistant -> "Создать программу с помощником"
                        Screen.Settings -> "Оформление"
                    }
                    compose.onNodeWithText(heading, substring = false).assertIsDisplayed()
                    compose.onNodeWithTag("page-scroll").assertIsDisplayed()
                    val page = compose.onNodeWithTag("page-scroll").fetchSemanticsNode().boundsInRoot
                    val root = compose.onRoot().fetchSemanticsNode().boundsInRoot
                    assertTrue(page.width > 0 && page.height > 0 && page.width <= root.width && page.height <= root.height)
                    val insets = androidx.core.view.ViewCompat.getRootWindowInsets(compose.activity.window.decorView)
                        ?.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
                    val safeBottom = root.bottom - insets
                    assertTrue("The player overlaps Android navigation", compose.onNodeWithTag("mini-player").fetchSemanticsNode().boundsInRoot.bottom <= safeBottom + 1f)
                    if (design == "v2") assertTrue("Bottom navigation overlaps Android gestures", compose.onNodeWithTag("bottom-navigation").fetchSemanticsNode().boundsInRoot.bottom <= safeBottom + 1f)
                    qa.capture("reference$suffix-$design-${screen.name.lowercase()}")
                }
            }
            compose.runOnIdle { qa.model.screen = Screen.Assistant }
            for (step in 2..4) {
                qa.visible("Далее").performClick()
                compose.onNodeWithText("Шаг $step / 4", substring = true).assertExists()
                qa.capture("reference$suffix-v2-assistant-step-$step")
            }
            compose.onNodeWithText("Подготовить программу", substring = false).assertExists()
            qa.visible("Назад").performClick()
            compose.onNodeWithText("Тренировок в неделю", substring = false).assertExists()
            compose.runOnIdle { qa.model.screen = Screen.Workout }
            val before = qa.model.plan.toString()
            compose.onNodeWithContentDescription("Изменить подход 2").performScrollTo().performClick()
            compose.onNodeWithText("Повторы", substring = false).assertExists()
            compose.onNode(hasText("Вес, кг", substring = false) and !hasAnyAncestor(hasTestTag("body-weight-panel"))).performScrollTo().performTextReplacement("7,5")
            assertEquals(before, qa.model.plan.toString())
            qa.capture("compact-set-editor")
            compose.onNodeWithContentDescription("Открыть календарь тренировок").performScrollTo().performClick()
            compose.onNodeWithTag("workout-calendar").assertIsDisplayed()
            qa.capture("calendar-dialog")
            compose.onNodeWithText("Закрыть", substring = false).performClick()
            qa.report("visual-snapshot$suffix", obj("result" to "passed", "source" to "recorded-server-responses", "network_enabled" to false,
                "layout" to layout, "routes" to Screen.entries.size, "designs" to 1, "design" to "v2", "system_navigation_insets_respected" to true, "editing_does_not_apply_without_confirmation" to true))
        } finally { compose.runOnIdle { qa.model.preferences = originalPreferences; qa.model.screen = Screen.Workout } }
    }
}
