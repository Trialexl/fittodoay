package com.fittodoay.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import org.json.JSONObject

private fun completedSets(exercise: JSONObject, logs: List<JSONObject>) = exercise.array("sets").count { set ->
    logs.any { it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index") }
}

@Composable private fun Disclosure(title: String, subtitle: String, expanded: Boolean, tag: String, toggle: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag(tag).clickable(onClickLabel = if (expanded) "Свернуть" else "Развернуть", onClick = toggle)
        .semantics(mergeDescendants = true) { stateDescription = if (expanded) "Развёрнуто" else "Свёрнуто" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, null, Modifier.size(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable fun WorkoutChecklist(model: AppModel, info: (JSONObject) -> Unit, chat: (JSONObject) -> Unit, delete: (JSONObject) -> Unit) {
    // Keep nested disclosure choices outside the conditionally composed children.
    // Closing a program/day must not reset the exercises when it is reopened.
    var expansion by rememberSaveable(model.date) { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    fun rememberExpansion(key: String, value: Boolean) { expansion = expansion + (key to value) }
    val logs = model.plan.array("logs")
    val pendingExercise = model.restPending?.optJSONObject("exercise")?.optInt("template_exercise_id")
    val pendingIndex = model.restPending?.optJSONObject("set")?.optInt("set_index")
    model.plan.array("folders").forEach { folder ->
        key(model.date, folder.optInt("id")) {
            var open by rememberSaveable { mutableStateOf(true) }
            FitCard(Modifier.testTag("workout-program-${folder.getInt("id")}")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { Disclosure(folder.text("name"), "", open, "workout-folder-toggle-${folder.optInt("id")}") { open = !open } }
                    OutlinedButton(onClick = { chat(folder) }, enabled = !model.busy) { Text("✧ AI") }
                }
                if (open) folder.array("templates").forEach { template ->
                    key(template.optInt("id")) {
                        val exercises = template.array("exercises").filter { it.optBoolean("is_active", true) }
                        val count = exercises.sumOf { it.array("sets").size }
                        val done = exercises.sumOf { completedSets(it, logs) }
                        val dayKey = "day:${template.optInt("id")}"
                        val expanded = expansion[dayKey] ?: (done < count)
                        val pendingHere = exercises.any { e -> e.optInt("template_exercise_id") == pendingExercise && e.array("sets").any { it.optInt("set_index") == pendingIndex } }
                        val willComplete = count > 0 && done + (if (pendingHere) 1 else 0) >= count
                        LaunchedEffect(willComplete) { if (willComplete) rememberExpansion(dayKey, false) }
                        Disclosure(template.text("name"), "$done / $count подходов", expanded, "workout-day-toggle-${template.optInt("id")}") { rememberExpansion(dayKey, !expanded) }
                        if (expanded) exercises.forEach { exercise ->
                            key(exercise.optInt("template_exercise_id")) {
                                val source = exercise.optJSONObject("source") ?: JSONObject()
                                val defaults = exercise.optJSONObject("defaults") ?: JSONObject()
                                val sets = exercise.array("sets")
                                val completed = completedSets(exercise, logs)
                                val exerciseKey = "exercise:${exercise.optInt("template_exercise_id")}"
                                val exerciseOpen = expansion[exerciseKey] ?: (completed < sets.size)
                                val willCompleteExercise = sets.isNotEmpty() && completed + (if (pendingExercise == exercise.optInt("template_exercise_id")) 1 else 0) >= sets.size
                                LaunchedEffect(willCompleteExercise) { if (willCompleteExercise) rememberExpansion(exerciseKey, false) }
                                FitCard(padding = 12.dp) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.weight(1f)) { Disclosure(source.text("name"), "$completed из ${sets.size} подходов", exerciseOpen,
                                            "workout-exercise-toggle-${exercise.optInt("template_exercise_id")}") { rememberExpansion(exerciseKey, !exerciseOpen) } }
                                        IconButton(onClick = { info(exerciseInfoSource(source, folder)) }) { Icon(Icons.Outlined.Info, "Техника и описание") }
                                    }
                                    if (exercise.text("note").isNotBlank()) Text(exercise.text("note"), style = MaterialTheme.typography.bodySmall)
                                    if (exerciseOpen) sets.forEach { set ->
                                        val logged = logs.find { it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index") }
                                        SetRow(model, exercise, set, defaults, logged, delete)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
