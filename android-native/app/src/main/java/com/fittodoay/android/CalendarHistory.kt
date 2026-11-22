package com.fittodoay.android

import org.json.JSONObject

data class LocalWorkoutDay(val plan: JSONObject, val updatedAt: Long)
data class LocalWorkoutHistory(val days: Map<String, LocalWorkoutDay> = emptyMap(), val pendingDates: Set<String> = emptySet())

/** A server response only supersedes local writes that preceded its request. */
fun calendarLoads(response: StoredResponse?, local: LocalWorkoutHistory?): Map<String, Double> {
    val result = response?.value?.rows().orEmpty().associate { it.text("date") to it.optDouble("load", 0.0) }.toMutableMap()
    local?.days?.forEach { (date, day) ->
        if (date !in result || date in local.pendingDates || day.updatedAt > (response?.asOf ?: 0)) result[date] = workoutLoad(day.plan)
    }
    return result
}
