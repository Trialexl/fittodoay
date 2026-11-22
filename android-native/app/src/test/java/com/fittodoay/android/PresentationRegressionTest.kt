package com.fittodoay.android

import org.junit.Test
import org.junit.Assert.*
import java.time.LocalDate

class PresentationRegressionTest {
    @Test fun foldersUseTheWebStorageConventionAndWindowsPaths() {
        assertEquals("Rock / Live Sets", musicFolderLabel(obj("filename" to "system/rock/live_sets/song.mp3")))
        assertEquals("Rock / Live Sets", musicFolderLabel(obj("filename" to "user_32\\rock\\live_sets\\song.mp3")))
        assertEquals("Мои треки", musicFolderLabel(obj("filename" to "user_32/song.mp3")))
        assertEquals("Системные", musicFolderLabel(obj("filename" to "system/song.mp3")))
        assertEquals("Без папки", musicFolderLabel(obj("filename" to "song.mp3")))
        assertEquals("Радио · Релакс", musicFolderLabel(obj("source_type" to "stream", "stream_category" to "relax")))
    }
    @Test fun firstOpenDefaultsToFoldersButRetainsAnExplicitChoice() {
        assertEquals("folder", musicGrouping(""))
        assertEquals("folder", musicGrouping("unexpected"))
        assertEquals("none", musicGrouping("none"))
        assertEquals("artist", musicGrouping("artist"))
    }
    @Test fun everyAnalyticsEndpointUsesTheSameInclusivePeriodAsProgramTrends() {
        val today = LocalDate.of(2026, 11, 22)
        assertEquals("start=2026-11-16&end=2026-11-22", analyticsRangeQuery("week", today))
        assertEquals("start=2026-10-24&end=2026-11-22", analyticsRangeQuery("month", today))
        assertEquals("start=2026-05-27&end=2026-11-22", analyticsRangeQuery("half-year", today))
        assertEquals("start=2025-11-23&end=2026-11-22", analyticsRangeQuery("year", today))
    }
    @Test fun annualRadarUsesCalendarMonthAveragesWithoutConvertingMissingRecordsToZero() {
        val lines = monthlyRadarLines(listOf(TrendLine("test", "Тест", mapOf("2026-01-01" to null, "2026-01-12" to 10.0, "2026-01-21" to 0.0, "2026-02-03" to null))))
        assertEquals(5.0, lines.first().points["2026-01-01"]!!, .0001)
        assertNull(lines.first().points["2026-02-01"])
    }
}
