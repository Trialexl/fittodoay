package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import org.json.JSONObject

private fun completedSets(exercise: JSONObject, logs: List<JSONObject>) = exercise.array("sets").count { set ->
    logs.any { it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index") }
}

@Composable private fun Disclosure(title: String, subtitle: String, expanded: Boolean, tag: String, program: Boolean = false, count: String? = null, toggle: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).testTag(tag).clickable(onClickLabel = if (expanded) "Свернуть" else "Развернуть", onClick = toggle)
        .semantics(mergeDescendants = true) { stateDescription = if (expanded) "Развёрнуто" else "Свёрнуто" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(title, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.titleSmall.copy(fontSize = if (program) 13.sp else 15.sp, lineHeight = 20.sp))
                count?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable fun WorkoutChecklist(model: AppModel, info: (JSONObject) -> Unit, chat: (JSONObject) -> Unit, delete: (JSONObject) -> Unit, edit: (String, Int, Int) -> Unit) {
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
            val folderExercises = folder.array("templates").flatMap { it.array("exercises") }.filter { it.optBoolean("is_active", true) }
            val folderComplete = folderExercises.isNotEmpty() && folderExercises.all { completedSets(it, logs) == it.array("sets").size }
            val completedColor = androidx.compose.ui.graphics.Color(0xff16a34a)
            Surface(Modifier.fillMaxWidth().testTag("workout-program-${folder.getInt("id")}"), shape = RoundedCornerShape(18.dp),
                color = if (folderComplete) completedColor.copy(alpha = .07f) else MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface,
                border = BorderStroke(1.dp, if (folderComplete) completedColor.copy(alpha = .35f) else MaterialTheme.colorScheme.outlineVariant)) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { Disclosure(folder.text("name"), "", open, "workout-folder-toggle-${folder.optInt("id")}", program = true) { open = !open } }
                    OutlinedButton(onClick = { chat(folder) }, enabled = !model.busy, shape = RoundedCornerShape(9.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp), modifier = Modifier.heightIn(min = 36.dp)) { Text("✧ AI", style = MaterialTheme.typography.labelSmall) }
                    IconButton(onClick = { edit("folders", folder.getInt("id"), 0) }, Modifier.size(40.dp), enabled = !model.busy) { Icon(Icons.Outlined.Edit, "Редактировать программу", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) }
                }
                if (open) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val muscles = summarizeMuscles(exercises, logs).take(4).joinToString(" • ") { it.name }
                            Box(Modifier.weight(1f)) { Disclosure(template.text("name"), muscles, expanded, "workout-day-toggle-${template.optInt("id")}", count = "$done/$count") { rememberExpansion(dayKey, !expanded) } }
                            IconButton(onClick = { edit("templates", template.getInt("id"), 0) }, Modifier.size(40.dp), enabled = !model.busy) { Icon(Icons.Outlined.Edit, "Редактировать шаблон дня", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) }
                        }
                        if (expanded) exercises.forEachIndexed { exerciseIndex, exercise ->
                            key(exercise.optInt("template_exercise_id")) {
                                val source = exercise.optJSONObject("source") ?: JSONObject()
                                val defaults = exercise.optJSONObject("defaults") ?: JSONObject()
                                val sets = exercise.array("sets")
                                val completed = completedSets(exercise, logs)
                                val exerciseKey = "exercise:${exercise.optInt("template_exercise_id")}"
                                val exerciseOpen = expansion[exerciseKey] ?: (completed < sets.size)
                                val willCompleteExercise = sets.isNotEmpty() && completed + (if (pendingExercise == exercise.optInt("template_exercise_id")) 1 else 0) >= sets.size
                                LaunchedEffect(willCompleteExercise) { if (willCompleteExercise) rememberExpansion(exerciseKey, false) }
                                val exerciseComplete = sets.isNotEmpty() && completed == sets.size
                                Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), color = if (exerciseComplete) completedColor.copy(alpha = .06f) else MaterialTheme.colorScheme.surface,
                                    contentColor = MaterialTheme.colorScheme.onSurface, border = BorderStroke(1.dp, if (exerciseComplete) completedColor.copy(alpha = .35f) else MaterialTheme.colorScheme.outlineVariant)) {
                                Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
                                    Row(Modifier.padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Surface(shape = RoundedCornerShape(9.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                                            Box(Modifier.width(28.dp).height(34.dp), contentAlignment = Alignment.Center) { Text((exerciseIndex + 1).toString().padStart(2, '0'), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary) }
                                        }
                                        Column(Modifier.weight(1f).heightIn(min = 54.dp).testTag("workout-exercise-toggle-${exercise.optInt("template_exercise_id")}")
                                            .clickable { rememberExpansion(exerciseKey, !exerciseOpen) }.semantics(mergeDescendants = true) { stateDescription = if (exerciseOpen) "Развёрнуто" else "Свёрнуто" }, verticalArrangement = Arrangement.Center) {
                                            Text(source.text("name"), style = MaterialTheme.typography.titleSmall)
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text("$completed из ${sets.size} подходов", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                Icon(if (exerciseOpen) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, null, Modifier.padding(start = 4.dp).size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                        Column {
                                            IconButton(onClick = { info(exerciseInfoSource(source, folder)) }, Modifier.size(32.dp)) { Icon(Icons.Outlined.Info, "Техника и описание", Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                                            IconButton(onClick = { edit("template-exercises", exercise.getInt("template_exercise_id"), template.getInt("id")) }, Modifier.size(32.dp), enabled = !model.busy) { Icon(Icons.Outlined.Edit, "Редактировать упражнение", Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary) }
                                        }
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
    }
}
