package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.geometry.Offset
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
        if (fixture.optJSONObject("templates")?.has("id") == true) fixture.put("templates", org.json.JSONArray().put(fixture.getJSONObject("templates")))
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
                    compose.onAllNodesWithText(heading, substring = false).onFirst().assertIsDisplayed()
                    compose.onNodeWithTag("page-scroll").assertIsDisplayed()
                    val page = compose.onNodeWithTag("page-scroll").fetchSemanticsNode().boundsInRoot
                    val root = compose.onRoot().fetchSemanticsNode().boundsInRoot
                    assertTrue(page.width > 0 && page.height > 0 && page.width <= root.width && page.height <= root.height)
                    val insets = androidx.core.view.ViewCompat.getRootWindowInsets(compose.activity.window.decorView)
                        ?.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
                    val safeBottom = root.bottom - insets
                    assertTrue("The player overlaps Android navigation", compose.onNodeWithTag("mini-player").fetchSemanticsNode().boundsInRoot.bottom <= safeBottom + 1f)
                    if (layout != "tablet-1067") assertTrue("Bottom navigation overlaps Android gestures", compose.onNodeWithTag("bottom-navigation").fetchSemanticsNode().boundsInRoot.bottom <= safeBottom + 1f)
                    if (layout == "tablet-1067") compose.onNodeWithTag("side-navigation").assertIsDisplayed()
                    qa.capture("reference$suffix-$design-${screen.name.lowercase()}")
                }
            }
            // Inspect the actual secondary surfaces, not only route headings.
            compose.runOnIdle { qa.model.screen = Screen.Workout; qa.model.preferences = JSONObject(qa.model.preferences.toString()).put("muscle_summary_view", "bars") }
            qa.visible("Группы мышц").assertExists()
            qa.capture("design-muscle-widget$suffix")
            compose.onNodeWithTag("body-weight-panel").performScrollTo()
            qa.capture("design-body-weight$suffix")
            val firstProgram = qa.model.plan.array("folders").first()
            compose.onNodeWithTag("workout-program-${firstProgram.getInt("id")}").performScrollTo()
            qa.capture("density-main-checklist$suffix")
            qa.visible(hasContentDescription("Техника и описание"), "exercise information").performClick()
            compose.onNodeWithTag("exercise-info-sheet").assertIsDisplayed()
            qa.capture("design-exercise-description$suffix")
            compose.onNodeWithTag("exercise-image-pager").performScrollTo().performTouchInput { swipeLeft() }
            compose.onNodeWithText("2 / 2", substring = false).assertExists()
            qa.capture("library-exercise-gallery$suffix")
            compose.onNodeWithContentDescription("Предыдущее изображение").performClick()
            compose.onNodeWithText("1 / 2", substring = false).assertExists()
            compose.onNodeWithText("Статистика", substring = false).performClick()
            qa.capture("design-exercise-statistics$suffix")
            compose.onNode(hasText("Источник:", substring = true) and hasAnyAncestor(hasTestTag("exercise-info-sheet"))).performScrollTo()
            qa.capture("design-exercise-statistics-bottom$suffix")
            compose.onNodeWithContentDescription("Закрыть").performClick()
            compose.onNodeWithContentDescription("Плейлист", useUnmergedTree = true).performClick()
            compose.onNodeWithTag("playlist-sheet").assertIsDisplayed()
            qa.capture("design-playlist$suffix")
            compose.onNodeWithText("Добавить музыку", substring = false).assertIsDisplayed().performClick()
            compose.onNodeWithText("Загрузить MP3", substring = false).assertIsDisplayed()
            qa.capture("design-playlist-upload$suffix")
            compose.onNodeWithText("Скрыть загрузку", substring = false).performClick()
            val search = compose.onNode(hasSetTextAction() and hasAnyAncestor(hasTestTag("playlist-sheet")))
            search.performTextReplacement("qa-no-matching-track-999")
            compose.onNodeWithText("Ничего не найдено", substring = false).assertExists()
            qa.capture("design-playlist-empty$suffix")
            search.performTextClearance()
            compose.onNodeWithContentDescription("Закрыть").performClick()
            compose.runOnIdle { qa.model.screen = Screen.Analytics }
            compose.onNodeWithTag("chart-weight_kg").performScrollTo()
            qa.capture("design-body-weight-chart$suffix")
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("metric-chart-loading").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("chart-weight_kg").performTouchInput { click(center) }
            compose.onNodeWithTag("chart-weight_kg-tooltip").assertExists()
            val expectedWeight = plotPointNumber(qa.model.weights.minBy { it.text("date") }.optDouble("weight_kg"))
            compose.onNode(hasText(expectedWeight) and hasAnyAncestor(hasTestTag("chart-weight_kg-tooltip")), useUnmergedTree = true).assertExists()
            qa.capture("library-body-weight-selected$suffix")
            fun reviewPlots(prefix: String) {
            val originalTrends = qa.model.trends
            // Clearly separate synthetic dense-series stress views from recorded-server screenshots.
            val stress = JSONObject(originalTrends.toString())
            val base = stress.array("folders").first()
            run {
                val samples = org.json.JSONArray()
                repeat(18) { i -> samples.put(obj("date" to java.time.LocalDate.of(2026, 11, 1).plusDays(i.toLong()).toString(), "load" to (180 + i * 14 + (i % 4) * 35))) }
                base.put("series", samples)
                val second = JSONObject(base.toString()).put("id", 990001).put("name", "QA вторая серия")
                val more = org.json.JSONArray()
                repeat(18) { i -> more.put(obj("date" to java.time.LocalDate.of(2026, 11, 1).plusDays(i.toLong()).toString(), "load" to (140 + i * 9 + (i % 3) * 50))) }
                second.put("series", more)
                stress.getJSONArray("folders").put(second)
                compose.runOnIdle { qa.model.trends = stress }
                for ((style, title) in trendStyles) {
                    if (style == "line") {
                        compose.onNodeWithText("Площадь", substring = false).performScrollTo().performClick()
                        compose.onNodeWithTag("trend-chart-area").performScrollTo()
                        val action = compose.onNodeWithText(title, substring = false).fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsActions.OnClick].action!!
                        fun framePixels(name: String): IntArray {
                            val latch = java.util.concurrent.CountDownLatch(1)
                            compose.runOnUiThread { compose.activity.window.decorView.postOnAnimation { latch.countDown() } }
                            assertTrue(latch.await(2, java.util.concurrent.TimeUnit.SECONDS))
                            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
                            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                            File(qa.directory, name + ".png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                            val pixels = IntArray(bitmap.width * bitmap.height)
                            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height); bitmap.recycle()
                            return pixels
                        }
                        compose.mainClock.autoAdvance = false
                        try {
                            compose.runOnUiThread { action() }
                            var ready = false
                            for (frame in 0..200) {
                                compose.mainClock.advanceTimeByFrame()
                                if (compose.onAllNodesWithTag("metric-chart-loading").fetchSemanticsNodes().isEmpty()) { ready = true; break }
                                Thread.sleep(5) // Allow Vico's background model transaction to finish before measuring animation.
                            }
                            assertTrue("The library chart model must be ready", ready)
                            compose.mainClock.advanceTimeBy(64)
                            val before = framePixels("density-animation-start$suffix")
                            compose.mainClock.advanceTimeBy(800)
                            // Vico prepares final drawing models on a worker; then Compose needs another frame.
                            repeat(8) { Thread.sleep(16); compose.mainClock.advanceTimeByFrame() }
                            val after = framePixels("density-animation-complete$suffix")
                            val changed = before.indices.count { before[it] != after[it] }
                            assertTrue("The chart must animate its appearance", changed > 300)
                            qa.report("chart-animation$suffix", obj("changed_pixels" to changed, "duration_ms" to 700))
                        } finally { compose.mainClock.autoAdvance = true }
                    }
                    compose.onNodeWithText(title, substring = false).performScrollTo().performClick()
                    val chart = compose.onNodeWithTag("trend-chart-$style").performScrollTo()
                    compose.waitUntil(10_000) { compose.onAllNodesWithTag("metric-chart-loading").fetchSemanticsNodes().isEmpty() }
                    compose.waitForIdle()
                    when (style) {
                        "pie" -> compose.onNodeWithTag("pie-slice-0").performTouchInput { click(Offset(width * .93f, height * .5f)) }
                        "radar" -> compose.onNodeWithTag("radar-point-0-0").performTouchInput { click(center) }
                        "heatmap" -> compose.onNodeWithTag("heatmap-cell-0-0").performTouchInput { click(center) }
                        else -> chart.performTouchInput { click(Offset(width * .02f, height * .7f)) }
                    }
                    qa.capture("$prefix-tapped-$style$suffix")
                    val tooltip = compose.onNodeWithTag("trend-chart-$style-tooltip")
                    tooltip.assertExists()
                    if (style in listOf("line", "area", "stacked", "columns")) chart.assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, if (style == "columns") "За выбранный период, ${base.text("name")}: 6257, QA вторая серия: 4797" else "2026-11-01, ${base.text("name")}: 180, QA вторая серия: 140"))
                    if (style in listOf("line", "area", "stacked")) {
                        compose.onNode(hasText("2026-11-01") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                        chart.performTouchInput { swipe(Offset(width * .02f, height * .7f), Offset(width * .98f, height * .7f), 350) }
                        compose.onNode(hasText("2026-11-18") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                    }
                    if (style == "radar") {
                        compose.onNode(hasText("2026-11-01") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                        compose.onNode(hasText("180") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                    }
                    if (style == "heatmap") {
                        chart.performScrollToIndex(34)
                        compose.onNodeWithTag("heatmap-cell-17-0").performTouchInput { click(center) }
                        compose.onNode(hasText("2026-11-18") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                    }
                    if (style == "columns") {
                        compose.onNode(hasText("6257") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                        chart.performTouchInput { swipe(Offset(width * .02f, height * .7f), Offset(width * .98f, height * .7f), 350) }
                        compose.onNode(hasText("4797") and hasAnyAncestor(hasTestTag("trend-chart-$style-tooltip")), useUnmergedTree = true).assertExists()
                    }
                    tooltip.performScrollTo().assertIsDisplayed()
                    compose.onNodeWithTag("trend-chart-$style-panel").performScrollTo()
                    qa.capture("$prefix-chart-$style$suffix")
                }
                compose.runOnIdle { qa.model.trends = originalTrends }
            }
            }
            reviewPlots("stress")
            compose.runOnIdle { qa.model.screen = Screen.Programs }
            val template = qa.model.templates.first { it.array("template_exercises").isNotEmpty() }
            val folderId = template.getInt("folder")
            compose.onNodeWithTag("program-library").performScrollTo()
            compose.onNodeWithTag("select-program-$folderId").performScrollTo().performClick()
            compose.waitForIdle()
            val programDay = compose.onNodeWithTag("program-day-${template.getInt("id")}")
            programDay.assertExists()
            if (programDay.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.StateDescription] == "Свёрнуто")
                compose.onNode(hasContentDescription("Раскрыть день") and hasAnyAncestor(hasTestTag("program-day-${template.getInt("id")}"))).performScrollTo().performClick()
            val exercise = template.array("template_exercises").first()
            qa.visible(programExerciseSummary(exercise)).assertIsDisplayed()
            qa.capture("program-targets$suffix")
            compose.runOnIdle { qa.model.screen = Screen.Assistant }
            for (step in 2..4) {
                qa.visible("Далее").performClick()
                compose.onNodeWithText("ШАГ $step / 4", substring = true).assertExists()
                qa.capture("reference$suffix-v2-assistant-step-$step")
            }
            compose.onNodeWithText("Подготовить программу", substring = false).assertExists()
            qa.visible("Назад").performClick()
            compose.onNodeWithText("Тренировок в неделю", substring = false).assertExists()
            compose.runOnIdle { qa.model.screen = Screen.Workout }
            compose.runOnIdle { qa.model.screen = Screen.Assistant }
            compose.onNodeWithText("ШАГ 3 / 4", substring = false).assertExists()
            compose.runOnIdle { qa.model.screen = Screen.Workout }
            val before = qa.model.plan.toString()
            compose.onNodeWithContentDescription("Изменить подход 1").performScrollTo().performClick()
            compose.onNodeWithText("Повторы", substring = false).assertExists()
            compose.onNode(hasContentDescription("Вес (кг)") and hasAnyAncestor(hasTestTag("completed-set-dialog"))).performScrollTo().performTextReplacement("7,5")
            assertEquals(before, qa.model.plan.toString())
            qa.capture("compact-set-editor")
            compose.onNodeWithText("Отмена", substring = false).performClick()
            compose.onNodeWithContentDescription("Открыть календарь тренировок").performScrollTo().performClick()
            compose.onNodeWithTag("workout-calendar").assertIsDisplayed()
            qa.capture("calendar-dialog")
            compose.onNodeWithText("Закрыть", substring = false).performClick()
            compose.runOnIdle {
                androidx.core.view.WindowCompat.getInsetsController(compose.activity.window, compose.activity.window.decorView).hide(androidx.core.view.WindowInsetsCompat.Type.ime())
            }
            compose.waitUntil(5000) {
                androidx.core.view.ViewCompat.getRootWindowInsets(compose.activity.window.decorView)
                    ?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime()) != true
            }
            compose.runOnIdle { qa.model.preferences = JSONObject(qa.model.preferences.toString()).put("theme", "dark") }
            for (screen in Screen.entries) {
                compose.runOnIdle { qa.model.screen = screen }
                compose.waitForIdle()
                qa.capture("dark$suffix-${screen.name.lowercase()}")
            }
            compose.runOnIdle { qa.model.screen = Screen.Workout }
            qa.visible("Группы мышц").performScrollTo()
            qa.capture("design-dark-muscle-widget$suffix")
            compose.onNodeWithTag("body-weight-panel").performScrollTo()
            qa.capture("design-dark-body-weight$suffix")
            qa.visible(hasContentDescription("Техника и описание"), "dark exercise information").performClick()
            qa.capture("design-dark-exercise-description$suffix")
            compose.onNodeWithText("Статистика", substring = false).performClick()
            qa.capture("design-dark-exercise-statistics$suffix")
            compose.onNode(hasText("Источник:", substring = true) and hasAnyAncestor(hasTestTag("exercise-info-sheet"))).performScrollTo()
            qa.capture("design-dark-exercise-statistics-bottom$suffix")
            compose.onNodeWithContentDescription("Закрыть").performClick()
            compose.onNodeWithContentDescription("Плейлист", useUnmergedTree = true).performClick()
            qa.capture("design-dark-playlist$suffix")
            compose.onNodeWithContentDescription("Закрыть").performClick()
            compose.runOnIdle { qa.model.screen = Screen.Analytics }
            reviewPlots("stress-dark")
            compose.onNodeWithContentDescription("Настройки оформления").performClick()
            compose.onNodeWithText("Готово", substring = false).assertIsDisplayed()
            qa.capture("appearance-dialog$suffix")
            compose.onNodeWithText("Готово", substring = false).performClick()
            qa.report("visual-snapshot$suffix", obj("result" to "passed", "source" to "recorded-server-responses", "network_enabled" to false,
                "layout" to layout, "routes" to Screen.entries.size, "designs" to 1, "design" to "v2", "system_navigation_insets_respected" to true, "editing_does_not_apply_without_confirmation" to true, "chart_styles_per_theme" to 7, "chart_stress_source" to "synthetic", "playlist_search_and_upload_form" to true, "exercise_description_and_statistics" to true))
        } finally { compose.runOnIdle { qa.model.preferences = originalPreferences; qa.model.screen = Screen.Workout } }
    }
}
