package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
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
@OptIn(ExperimentalLayoutApi::class)
@Composable fun MuscleSummary(exercises: List<JSONObject>, logs: List<JSONObject>, mode: String) {
    val summary = remember(exercises, logs) { summarizeMuscles(exercises, logs) }
    if (summary.isEmpty()) return
    var expanded by remember(mode) { mutableStateOf(mode != "row") }
    val accent = MaterialTheme.colorScheme.primary
    if (mode == "chips") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            summary.forEach { group -> Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(9.dp), color = androidx.compose.ui.graphics.Color.White.copy(alpha = .05f)) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text(group.name.replaceFirstChar(Char::titlecase), style = MaterialTheme.typography.labelSmall)
                    Text(group.total.toString(), color = accent, style = MaterialTheme.typography.labelSmall)
                }
            } }
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.heightIn(min = 44.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(if (mode == "row") "Группы мышц · ${summary.size} ${if (expanded) "▴" else "▾"}" else "Группы мышц", style = MaterialTheme.typography.titleSmall)
                Text("Упражнения: выполнено / всего", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(if (expanded) androidx.compose.material.icons.Icons.Outlined.ExpandLess else androidx.compose.material.icons.Icons.Outlined.ExpandMore,
                if (expanded) "Скрыть группы мышц" else "Показать группы мышц", Modifier.size(18.dp), tint = accent)
        }
        if (expanded) {
            val largest = summary.maxOf { it.total }.coerceAtLeast(1)
            summary.forEach { group ->
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(group.name.replaceFirstChar(Char::titlecase), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    androidx.compose.foundation.Canvas(Modifier.weight(1.2f).height(7.dp).semantics {
                        contentDescription = "${group.name}: выполнено упражнений"
                        progressBarRangeInfo = ProgressBarRangeInfo(group.completed.toFloat(), 0f..group.total.toFloat())
                    }) {
                        val width = size.width * group.total / largest
                        drawRoundRect(accent.copy(alpha = .17f), size = androidx.compose.ui.geometry.Size(width, size.height), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2))
                        if (group.completed > 0) drawRoundRect(accent, size = androidx.compose.ui.geometry.Size(width * group.completed / group.total, size.height), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2))
                    }
                    Text("${group.completed} из ${group.total}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                listOf("Выполнено" to 1f, "Осталось" to .17f).forEach { (label, alpha) ->
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.size(7.dp).background(accent.copy(alpha = alpha), androidx.compose.foundation.shape.RoundedCornerShape(2.dp)))
                        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
fun exerciseInfoSource(source: JSONObject, folder: JSONObject): JSONObject = JSONObject(source.toString())
    .put("stats_folder_id", folder.getInt("id")).put("stats_folder_name", folder.text("name"))

fun exerciseSeries(trends: JSONObject, name: String, folderId: Int? = null): List<JSONObject> {
    fun matching(exercises: List<JSONObject>) = exercises.filter { it.text("exercise_name").trim().equals(name.trim(), ignoreCase = true) }
    val folders = trends.array("folders")
    val preferred = folders.firstOrNull { it.optInt("id") == folderId }
    val scoped = preferred?.let { matching(it.array("exercises")) }.orEmpty()
    val points = (scoped.ifEmpty { matching(folders.flatMap { it.array("exercises") }) }).flatMap { it.array("series") }
    return points.groupBy { it.text("date") }.toSortedMap().mapNotNull { (date, rows) ->
        val load = rows.sumOf { if (it.isNull("load")) 0.0 else it.optDouble("load", 0.0) }
        val weighted = rows.filter { !it.isNull("avg_weight") && it.optInt("weight_sets") > 0 }
        val sets = weighted.sumOf { it.optInt("weight_sets") }
        if (load <= 0 && sets == 0) return@mapNotNull null
        obj("date" to date, "load" to load, "avg_weight" to if (sets == 0) null else weighted.sumOf { it.optDouble("avg_weight") * it.optInt("weight_sets") } / sets)
    }
}
@Composable fun ExerciseStatistics(source: JSONObject, model: AppModel) {
    val scope = source.optInt("stats_folder_id").takeIf { it > 0 }
    var sourceLabel by remember(source.text("name"), scope) { mutableStateOf("") }
    var data by remember(source.text("name"), scope) { mutableStateOf<List<JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }; var error by remember { mutableStateOf<String?>(null) }
    var metric by remember { mutableStateOf("load") }; var retry by remember { mutableIntStateOf(0) }
    LaunchedEffect(source.text("name"), scope, retry) {
        loading = true; error = null
        try {
            val response = model.api.call("/api/analytics/program-trends/?range=half-year&granularity=day") as JSONObject
            val folders = response.array("folders")
            val preferred = folders.firstOrNull { it.optInt("id") == scope } ?: folders.firstOrNull()
            data = exerciseSeries(response, source.text("name"), preferred?.optInt("id"))
            sourceLabel = if (preferred?.array("exercises")?.any { it.text("exercise_name").trim().equals(source.text("name").trim(), true) } == true) preferred.text("name") else "Все программы"
        }
        catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; error = "Не удалось загрузить статистику" }
        finally { loading = false }
    }
    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    error?.let { Text(it); TextButton(onClick = { retry++ }) { Text("Повторить") } }
    SegmentedOptions(metric, listOf("load" to "Нагрузка", "avg_weight" to "Средний вес")) { metric = it }
    if (!loading && error == null) {
        Chart(data, metric)
        if (data.isNotEmpty()) Text("Источник: $sourceLabel", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
