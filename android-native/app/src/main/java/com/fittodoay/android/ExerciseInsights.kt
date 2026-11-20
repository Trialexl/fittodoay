package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.util.Locale

data class MuscleProgress(val name: String, val total: Int, val completed: Int)
fun summarizeMuscles(exercises: List<JSONObject>, logs: List<JSONObject>): List<MuscleProgress> {
    val counts = linkedMapOf<String, Pair<Int, Int>>()
    for (exercise in exercises.filter { it.optBoolean("is_active", true) }) {
        val sets = exercise.array("sets")
        val complete = sets.isNotEmpty() && sets.all { set -> logs.any {
            it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index")
        } }
        exercise.optJSONObject("source")?.text("target_muscles").orEmpty().split(Regex("[/,]"))
            .map { it.trim().lowercase(Locale.forLanguageTag("ru")) }.filter { it.isNotEmpty() }.distinct().forEach { name ->
                val old = counts[name] ?: (0 to 0); counts[name] = old.first + 1 to (old.second + if (complete) 1 else 0)
            }
    }
    return counts.map { MuscleProgress(it.key, it.value.first, it.value.second) }.sortedWith(compareByDescending<MuscleProgress> { it.total }.thenBy { it.name })
}
@Composable fun MuscleSummary(exercises: List<JSONObject>, logs: List<JSONObject>, mode: String) {
    val summary = remember(exercises, logs) { summarizeMuscles(exercises, logs) }
    if (summary.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    if (mode == "row") TextButton(onClick = { expanded = !expanded }) { Text("Группы мышц · ${summary.size} ${if (expanded) "▴" else "▾"}") }
    if (mode == "row" && !expanded) return
    if (mode == "chips") Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        summary.forEach { Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(50), color = MaterialTheme.colorScheme.primary.copy(alpha = .06f), border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .15f))) {
            Text("${it.name}  ${it.total}", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        } }
    } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        summary.forEach { group -> Text("${group.name} · ${group.completed}/${group.total}", style = MaterialTheme.typography.labelLarge)
            LinearProgressIndicator(progress = { group.completed.toFloat() / group.total }, Modifier.fillMaxWidth()) }
    }
}
fun exerciseSeries(trends: JSONObject, name: String): List<JSONObject> {
    val points = trends.array("folders").flatMap { it.array("exercises") }
        .filter { it.text("exercise_name").trim().equals(name.trim(), ignoreCase = true) }.flatMap { it.array("series") }
    return points.groupBy { it.text("date") }.toSortedMap().mapNotNull { (date, rows) ->
        val load = rows.sumOf { if (it.isNull("load")) 0.0 else it.optDouble("load", 0.0) }
        if (load <= 0) return@mapNotNull null
        val weighted = rows.filter { !it.isNull("avg_weight") }
        val sets = weighted.sumOf { it.optInt("weight_sets", 1).coerceAtLeast(1) }
        obj("date" to date, "load" to load, "avg_weight" to if (sets == 0) null else weighted.sumOf { it.optDouble("avg_weight") * it.optInt("weight_sets", 1).coerceAtLeast(1) } / sets)
    }
}
@Composable fun ExerciseStatistics(source: JSONObject, model: AppModel) {
    var data by remember(source.text("name")) { mutableStateOf<List<JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }; var error by remember { mutableStateOf<String?>(null) }
    var metric by remember { mutableStateOf("load") }; var retry by remember { mutableIntStateOf(0) }
    LaunchedEffect(source.text("name"), retry) {
        loading = true; error = null
        try { data = exerciseSeries(model.api.call("/api/analytics/program-trends/?range=half-year&granularity=day") as JSONObject, source.text("name")) }
        catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; error = "Не удалось загрузить статистику" }
        finally { loading = false }
    }
    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    error?.let { Text(it); TextButton(onClick = { retry++ }) { Text("Повторить") } }
    Choices("Динамика за полгода", metric, listOf("load" to "Нагрузка", "avg_weight" to "Средний вес")) { metric = it }
    if (!loading && error == null) Chart(data, metric)
}
