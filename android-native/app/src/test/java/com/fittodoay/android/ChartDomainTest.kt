package com.fittodoay.android

import org.junit.Assert.*
import org.junit.Test

class ChartDomainTest {
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
