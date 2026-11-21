package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.time.LocalDate

class CalendarParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun monthlyCalendarLoadsAndSelectsWorkoutDate() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("calendarParity") == "true")
        val qa = QaHarness(compose); qa.guard(); qa.navigate(Screen.Workout)
        val before = qa.model.date; val yesterday = LocalDate.parse(before).minusDays(1).toString()
        try {
            qa.visible(hasContentDescription("Открыть календарь тренировок"), "calendar").performClick()
            compose.onNodeWithTag("workout-calendar").assertIsDisplayed()
            compose.waitUntil(15_000) { compose.onAllNodesWithTag("calendar-loading").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithText("Не удалось загрузить нагрузку календаря", substring = false).assertDoesNotExist()
            compose.onNodeWithContentDescription("Следующий месяц").performClick()
            compose.onNodeWithContentDescription("Предыдущий месяц").performClick()
            compose.waitUntil(15_000) { compose.onAllNodesWithTag("calendar-loading").fetchSemanticsNodes().isEmpty() }
            qa.capture("components-calendar-live")
            compose.onNodeWithTag("calendar-date-$yesterday").performClick(); qa.waitRequest()
            assertEquals(yesterday, qa.model.plan.text("date"))
            qa.visible(hasContentDescription("Открыть календарь тренировок"), "calendar").performClick()
            compose.onNode(hasText("Сегодня", substring = false) and hasAnyAncestor(isDialog())).performClick(); qa.waitRequest()
            assertEquals(LocalDate.now().toString(), qa.model.date)
            qa.capture("calendar-selected")
            qa.report("calendar", obj("result" to "passed", "date_selection" to true, "return_to_today" to true))
        } finally { compose.runOnIdle { qa.model.date = before; qa.model.refresh() }; qa.waitRequest() }
    }
}
