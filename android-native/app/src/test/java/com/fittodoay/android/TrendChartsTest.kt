package com.fittodoay.android

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject

class TrendChartsTest {
    @Test fun interpolationPreservesZeroAndCarriesEdges() {
        assertEquals(listOf(10.0, 10.0, 5.0, 0.0, 0.0), interpolateTrend(listOf(null, 10.0, null, 0.0, null)))
        assertEquals(listOf(0.0, 0.0), interpolateTrend(listOf(null, null)))
    }
    @Test fun stackedAreasUseCumulativeBoundariesWithoutChangingSelectedRecords() {
        val original = listOf(listOf(10.0, 0.0, 30.0), listOf(5.0, 8.0, 2.0))
        assertEquals(listOf(listOf(15.0, 8.0, 32.0), listOf(10.0, 0.0, 30.0)), stackedTrendValues(original))
        assertEquals(listOf(5.0, 8.0, 2.0), original[1])
    }
    @Test fun exerciseViewIsScopedToSelectedProgramAndKeepsMissingValues() {
        val data = JSONObject("""{"folders":[{"id":1,"name":"A","series":[],"exercises":[{"template_exercise_id":9,"exercise_name":"Curl","template_name":"Day A","series":[{"date":"2026-11-01","load":null},{"date":"2026-11-02","load":0}]}]},{"id":2,"name":"B","exercises":[]}]}""")
        assertTrue(trendLines(data, true, 2).isEmpty())
        val line = trendLines(data, true, 1).single()
        assertNull(line.points["2026-11-01"]); assertEquals(0.0, line.points["2026-11-02"]!!, 0.0)
        assertEquals("Curl · Day A", line.label)
    }
}
