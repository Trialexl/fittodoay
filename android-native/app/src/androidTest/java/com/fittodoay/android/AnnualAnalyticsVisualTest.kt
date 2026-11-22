package com.fittodoay.android

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File

/** Actual annual server records from the dedicated cross-client QA account, both themes. */
class AnnualAnalyticsVisualTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun reviewAllSevenChartsForYearAndHalfYear() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("annualAnalytics") == "true")
        val email = requireNotNull(args.getString("qaEmail"))
        check(email.startsWith("android-cross-") && email.endsWith("@example.invalid"))
        val qa = QaHarness(compose); qa.guard()
        val store = SessionStore(qa.context); val original = store.read()
        val login = Api { "" }.call("/api/auth/login/", "POST", obj("email" to email, "password" to requireNotNull(args.getString("qaPassword")))) as JSONObject
        val token = login.getString("token"); val referenceApi = Api { token }
        val preferences = referenceApi.call("/api/profile/preferences/") as JSONObject
        try {
            compose.runOnIdle { qa.model.logout(); store.write(token); compose.activity.viewModelStore.clear() }
            compose.activityRule.scenario.recreate()
            compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest()
            for (theme in listOf("light", "dark")) {
                compose.runOnIdle { qa.model.preferences(obj("theme" to theme, "design_version" to "v2")) }; qa.waitRequest()
                for (range in listOf("year", "half-year")) {
                    compose.runOnIdle { qa.model.range = range; qa.model.navigate(Screen.Analytics) }; qa.waitRequest()
                    assertTrue("Annual fixture must contain many recorded workouts", qa.model.days.count { it.optDouble("load", 0.0) > 0 } > 40)
                    assertTrue("Weight chart needs at least 50 actual records", qa.model.weights.count { !it.isNull("weight_kg") } >= 50)
                    assertTrue("Top exercises must exercise the collapsed ranking", qa.model.exerciseStats.size > 10)
                    val prefix = "annual-$theme-$range-${args.getString("layoutName", "reference")}"
                    qa.capture("$prefix-summary")
                    val pixels = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                    for (y in listOf(8, pixels.height - 8)) {
                        val color = pixels.getPixel(pixels.width / 2, y)
                        val brightness = (android.graphics.Color.red(color) + android.graphics.Color.green(color) + android.graphics.Color.blue(color)) / 3
                        assertTrue("System bar background must follow $theme theme", if (theme == "dark") brightness < 128 else brightness > 128)
                    }
                    pixels.recycle()
                    qa.scrollTag("top-exercises"); compose.onNodeWithTag("top-exercise-5").assertDoesNotExist(); qa.capture("$prefix-ranking")
                    qa.scrollTag("analytics-body-weight"); qa.capture("$prefix-weight")
                    compose.onNodeWithTag("chart-weight_kg").performTouchInput { click(center) }
                    compose.onNodeWithTag("chart-weight_kg-tooltip").assertExists()
                    qa.capture("$prefix-weight-selected")
                    for ((style, title) in trendStyles) {
                        qa.visible(hasContentDescription("Параметры графика"), "chart options").performClick()
                        compose.onNodeWithText("Параметры графика", substring = false).assertIsDisplayed()
                        compose.onNodeWithContentDescription("Вид графика").performClick()
                        compose.onNode(hasText(title, substring = false) and hasAnyAncestor(isPopup())).performClick()
                        compose.onNodeWithText("Готово", substring = false).performClick()
                        val chart = compose.onNodeWithTag("trend-chart-$style").performScrollTo()
                        val toolbar = compose.onNodeWithTag("chart-toolbar").fetchSemanticsNode().boundsInRoot
                        val page = compose.onNodeWithTag("page-scroll")
                        val top = page.fetchSemanticsNode().boundsInRoot.top
                        page.performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f, toolbar.top - top - 8) }
                        compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("metric-chart-loading") and hasAnyAncestor(hasTestTag("trend-chart-$style"))).fetchSemanticsNodes().isEmpty() }
                        compose.waitForIdle()
                        when (style) {
                            "pie" -> compose.onNodeWithTag("pie-slice-0").performTouchInput { click(Offset(width * .93f, height * .5f)) }
                            "radar" -> compose.onNodeWithTag("radar-point-0-0").performTouchInput { click(center) }
                            "heatmap" -> compose.onNodeWithTag("heatmap-cell-0-0").performTouchInput { click(center) }
                            else -> chart.performTouchInput { click(center) }
                        }
                        compose.onNodeWithTag("trend-chart-$style-tooltip").assertExists()
                        qa.capture("$prefix-$style")
                        qa.scrollTag("trend-chart-$style-legend"); qa.capture("$prefix-$style-legend")
                    }
                    qa.report("$prefix", obj("source" to "actual-qa-server-records", "workout_days" to qa.model.days.count { it.optDouble("load", 0.0) > 0 }, "weigh_ins" to qa.model.weights.count { !it.isNull("weight_kg") }, "exercise_count" to qa.model.exerciseStats.size, "charts" to 7, "all_selectable" to true))
                }
            }
            // Keep a real filled checklist available for the floating player's visual review.
            val lastWorkout = qa.model.days.last { it.optDouble("load", 0.0) > 0 }.text("date")
            compose.runOnIdle { qa.model.date = lastWorkout }
            qa.navigate(Screen.Workout); qa.capture("annual-filled-checklist")
            qa.model.plan.array("folders").lastOrNull()?.let { folder -> qa.scrollTag("workout-program-${folder.getInt("id")}"); qa.capture("annual-checklist-info-and-dock") }
            qa.navigate(Screen.Settings); qa.capture("annual-settings")
        } finally {
            try { referenceApi.call("/api/profile/preferences/", "PUT", preferences) }
            finally { compose.runOnIdle { qa.model.logout(); store.write(original); compose.activity.viewModelStore.clear() } }
        }
    }
}
