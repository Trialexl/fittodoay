package com.fittodoay.android

import org.json.JSONObject

/** Uses the same override -> catalog default contract as the program editor. */
fun programExerciseSummary(exercise: JSONObject): String {
    val source = exercise.optJSONObject("exercise") ?: exercise.optJSONObject("custom_exercise") ?: JSONObject()
    fun target(override: String, default: String, fallback: String) = exercise.text(override, source.text(default, fallback))
    val sets = target("set_override", "default_sets", "3")
    val timed = source.optBoolean("has_time")
    val effort = if (timed) "${target("time_override", "default_time", "30")} сек" else "${target("rep_override", "default_reps", "10")} повт."
    val parts = mutableListOf("$sets × $effort")
    if (!timed && source.optBoolean("has_weight")) parts += "${target("weight_override", "default_weight", "0")} кг"
    val rest = target("rest_override", "default_rest", "60")
    parts += "отдых $rest сек"
    return parts.joinToString(" · ")
}
