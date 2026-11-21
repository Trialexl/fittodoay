package com.fittodoay.android

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class ExerciseInsightsTest {
    @Test fun exerciseStatisticsPreferTheProgramThatOpenedTheSheet() {
        fun folder(id: Int, load: Int) = obj("id" to id, "exercises" to JSONArray().put(obj("exercise_name" to "Bench", "series" to JSONArray().put(obj("date" to "2026-11-19", "load" to load)))))
        val trends = obj("folders" to JSONArray().put(folder(1, 100)).put(folder(2, 50)))
        assertEquals(50.0, exerciseSeries(trends, "bench", 2).single().getDouble("load"), 0.0)
        assertEquals(150.0, exerciseSeries(trends, "bench", 999).single().getDouble("load"), 0.0)
    }
    @Test fun averageWeightNeedsRealWeightedSetsAndCanExistWithoutLoad() {
        val rows = JSONArray().put(obj("date" to "2026-11-19", "load" to 0, "avg_weight" to 10, "weight_sets" to 1))
            .put(obj("date" to "2026-11-19", "load" to null, "avg_weight" to 999, "weight_sets" to 0))
        val trends = obj("folders" to JSONArray().put(obj("exercises" to JSONArray().put(obj("exercise_name" to "Bench", "series" to rows)))))
        assertEquals(10.0, exerciseSeries(trends, "bench").single().getDouble("avg_weight"), 0.0)
    }
    @Test fun completedMusclesRequireAllSetsAndIgnoreInactiveExercisesAndDuplicateLabels() {
        val exercise = obj("template_exercise_id" to 4, "source" to obj("target_muscles" to "Грудь / грудь, Трицепс"), "sets" to JSONArray().put(obj("set_index" to 1)).put(obj("set_index" to 2)))
        val log = obj("template_exercise" to 4, "set_index" to 1)
        val inactive = obj("is_active" to false, "source" to obj("target_muscles" to "Спина"))
        val partial = summarizeMuscles(listOf(exercise, inactive), listOf(log))
        assertEquals(2, partial.size); assertTrue(partial.all { it.total == 1 && it.completed == 0 })
        val complete = summarizeMuscles(listOf(exercise), listOf(log, obj("template_exercise" to 4, "set_index" to 2)))
        assertTrue(complete.all { it.completed == 1 })
    }
    @Test fun exerciseStatisticsCombineProgramsByDayAndExcludeDaysWithoutExercise() {
        fun folder(load: Int, weight: Double, sets: Int) = obj("exercises" to JSONArray().put(obj("exercise_name" to "Bench", "series" to JSONArray()
            .put(obj("date" to "2026-11-18", "load" to null)).put(obj("date" to "2026-11-19", "load" to load, "avg_weight" to weight, "weight_sets" to sets)))))
        val rows = exerciseSeries(obj("folders" to JSONArray().put(folder(100, 20.0, 2)).put(folder(50, 10.0, 1))), "bench")
        assertEquals(1, rows.size); assertEquals(150.0, rows.single().getDouble("load"), 0.0)
        assertEquals(50.0 / 3, rows.single().getDouble("avg_weight"), 0.0001)
    }
}
