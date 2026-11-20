package com.fittodoay.android

import org.junit.Assert.assertEquals
import org.junit.Test

class ProgramPresentationTest {
    @Test fun catalogDefaultsAndNullableOverrides() {
        val exercise = obj("exercise" to obj("has_weight" to true, "default_sets" to 4, "default_reps" to 12,
            "default_weight" to 32.5, "default_rest" to 90), "set_override" to null)
        assertEquals("4 × 12 повт. · 32.5 кг · отдых 90 сек", programExerciseSummary(exercise))
    }
    @Test fun overridesAndZeroWeightArePreserved() {
        val exercise = obj("exercise" to obj("has_weight" to true, "default_weight" to 20),
            "set_override" to 2, "rep_override" to 8, "weight_override" to 0, "rest_override" to 0)
        assertEquals("2 × 8 повт. · 0 кг · отдых 0 сек", programExerciseSummary(exercise))
    }
    @Test fun timedCustomExerciseDoesNotShowHiddenRepsOrWeight() {
        val exercise = obj("custom_exercise" to obj("has_time" to true, "has_weight" to true),
            "set_override" to 2, "time_override" to 45, "rep_override" to 99, "weight_override" to 99)
        assertEquals("2 × 45 сек · отдых 60 сек", programExerciseSummary(exercise))
    }
    @Test fun bodyweightDoesNotInventWeight() {
        assertEquals("3 × 10 повт. · отдых 60 сек", programExerciseSummary(obj("exercise" to obj("has_weight" to false))))
    }
}
