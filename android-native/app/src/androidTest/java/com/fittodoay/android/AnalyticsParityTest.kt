package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

class AnalyticsParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun allSevenChartsAndExerciseScopeRenderLiveData() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("analyticsParity") == "true")
        val qa = QaHarness(compose); qa.guard(); qa.navigate(Screen.Analytics)
        assertTrue(qa.model.days.any { it.optDouble("load") > 0 })
        for ((key, label) in trendStyles) {
            qa.visible("Вид графика")
            compose.onNodeWithText(label, substring = false).performScrollTo().performClick()
            qa.visible(hasTestTag("trend-chart-$key"), "chart $key").performTouchInput { click(center) }
            qa.capture("analytics-$key")
        }
        qa.visible("Детализация")
        compose.onAllNodesWithText("Упражнения", substring = false).filter(hasClickAction()).onLast().performScrollTo().performClick()
        assertTrue(trendLines(qa.model.trends, true, null).isNotEmpty())
        qa.visible(hasTestTag("trend-chart-radar"), "exercise radar").assertExists()
        qa.capture("analytics-exercise-scope")
        qa.report("analytics-charts", obj("result" to "passed", "styles" to 7, "exercise_scope" to true, "nonzero_server_data" to true))
    }
}
