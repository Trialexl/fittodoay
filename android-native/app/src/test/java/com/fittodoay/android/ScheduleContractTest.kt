package com.fittodoay.android

import org.junit.Assert.*
import org.junit.Test

class ScheduleContractTest {
    @Test(expected = IllegalArgumentException::class) fun zeroIntervalCannotBreakServerPlanGeneration() { scheduleConfig("interval", emptySet(), "2026-11-19", "0", "") }
    @Test(expected = IllegalArgumentException::class) fun invalidDateCannotBeSaved() { scheduleConfig("custom", emptySet(), "", "", "2026-02-31") }
    @Test fun allScheduleTypesUseWebContract() {
        assertEquals(2, scheduleConfig("weekly", setOf(0, 2), "", "", "").getJSONArray("days_of_week").length())
        assertEquals(2, scheduleConfig("biweekly", setOf(3), "2026-11-19", "2", "").getInt("week_interval"))
        assertEquals(3, scheduleConfig("interval", emptySet(), "2026-11-19", "3", "").getInt("every_x_days"))
        assertEquals(1, scheduleConfig("custom", emptySet(), "", "", "2026-11-19, 2026-11-19").getJSONArray("specific_dates").length())
    }
}
