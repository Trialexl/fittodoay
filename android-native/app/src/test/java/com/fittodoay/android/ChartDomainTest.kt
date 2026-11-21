package com.fittodoay.android

import org.junit.Assert.*
import org.junit.Test

class ChartDomainTest {
    @Test fun tooltipValuesKeepTheExactNumberInsteadOfThousandsAbbreviations() {
        assertEquals("12345,67", plotPointNumber(12345.67))
        assertEquals("0", plotPointNumber(0.0))
    }
    @Test fun pointSelectionUsesCellBoundsForColumnsAndHeatmap() {
        for (style in listOf("columns", "heatmap")) {
            assertEquals(0, plotDateIndex(style, 4, 24f, 100f))
            assertEquals(1, plotDateIndex(style, 4, 25f, 100f))
            assertEquals(3, plotDateIndex(style, 4, 100f, 100f))
        }
    }
    @Test fun lineSelectionSnapsToNearestDateAndClampsEdges() {
        assertEquals(1, plotDateIndex("line", 4, 20f, 100f))
        assertEquals(0, plotDateIndex("line", 4, -20f, 100f))
        assertEquals(3, plotDateIndex("line", 4, 120f, 100f))
        assertEquals(0, plotDateIndex("line", 1, 90f, 100f))
    }
    @Test fun scaleTicksRemainRoundWhenTheRangeNeedsOnlyThreeIntervals() {
        val domain = chartDomain(listOf(62.5, 100.0), true)
        assertEquals(50.0, (domain.maximum - domain.minimum) / domain.intervals, 0.0)
    }
    @Test fun measurementsKeepHundredthsInTheSelectedValue() {
        assertEquals("81,25", plotNumber(81.25))
        assertEquals("80,5", plotNumber(80.50))
    }
    @Test fun bodyWeightUsesVisibleVariationWithoutClipping() {
        val domain = chartDomain(listOf(80.2, 80.5, 81.25), false)
        assertTrue(domain.minimum > 75)
        assertTrue(domain.minimum <= 80.2 && domain.maximum >= 81.25)
    }
    @Test fun isolatedMeasurementHasNonzeroRangeAndSpaceAroundTheDot() {
        val domain = chartDomain(listOf(81.25), false)
        assertTrue(domain.minimum < 81.25 && domain.maximum > 81.25)
    }
    @Test fun stackedOrColumnValuesKeepTheirZeroBaselineAndLargestSum() {
        val domain = chartDomain(listOf(0.0, 11250.0, 8750.0), true)
        assertEquals(0.0, domain.minimum, 0.0)
        assertTrue(domain.maximum >= 11250.0)
    }
    @Test fun emptyNonFiniteAndNegativeSamplesNeverProduceAnInvalidScale() {
        for (values in listOf(emptyList(), listOf(Double.NaN, Double.POSITIVE_INFINITY), listOf(-20.0, -10.0), listOf(0.0))) {
            val domain = chartDomain(values, false)
            assertTrue(domain.minimum.isFinite() && domain.maximum.isFinite() && domain.maximum > domain.minimum)
            values.filter(Double::isFinite).forEach { assertTrue(it in domain.minimum..domain.maximum) }
        }
    }
}
