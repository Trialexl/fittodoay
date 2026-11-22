package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable fun ModernProgramLibrary(model: AppModel, selectedId: Int?, select: (Int) -> Unit, create: () -> Unit) {
    FitCard(Modifier.testTag("program-library"), padding = 12.dp) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Мои программы", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(model.folders.size.toString(), style = MaterialTheme.typography.bodySmall)
        }
        val largeFont = androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.2f
        val libraryState = rememberLazyListState()
        LaunchedEffect(selectedId) {
            val index = model.folders.indexOfFirst { it.optInt("id") == selectedId }
            if (index >= 0 && libraryState.layoutInfo.visibleItemsInfo.none { it.index == index }) libraryState.animateScrollToItem(index)
        }
        LazyRow(state = libraryState, modifier = Modifier.fillMaxWidth().testTag("program-library-list"), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(model.folders, key = { it.getInt("id") }) { folder ->
                val selected = selectedId == folder.optInt("id")
                Surface(onClick = { select(folder.getInt("id")) }, modifier = Modifier.width(if (largeFont) 240.dp else 166.dp).heightIn(min = 78.dp).testTag("select-program-${folder.getInt("id")}"),
                    shape = RoundedCornerShape(11.dp), color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .06f) else MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .2f) else Color.Transparent)) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Outlined.FolderOpen, null, Modifier.size(19.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(folder.text("name"), style = MaterialTheme.typography.labelLarge, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("●", color = if (folder.optBoolean("is_active")) Color(0xff22c55e) else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                                Text(if (folder.optBoolean("is_active")) "Активна" else "Выключена", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Text("↗", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        TextButton(onClick = create, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Add, null, Modifier.size(16.dp)); Text("Новая программа", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable fun ModernProgramFolder(model: AppModel, folder: JSONObject, editFolder: () -> Unit, addDay: () -> Unit,
    chat: () -> Unit, editDay: (JSONObject) -> Unit, editExercise: (JSONObject, JSONObject) -> Unit,
    addExercise: (JSONObject) -> Unit, info: (JSONObject) -> Unit, delete: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("program-${folder.getInt("id")}"), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text(folder.text("name"), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clickable(onClick = editFolder))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = chat, enabled = !model.chatBusy, shape = RoundedCornerShape(10.dp)) {
                Icon(Icons.Outlined.AutoAwesome, null, Modifier.size(14.dp)); Spacer(Modifier.width(6.dp)); Text("AI")
            }
            IconButton(onClick = addDay, modifier = Modifier.semantics { contentDescription = "Добавить день" }) { Icon(Icons.Outlined.Add, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
            IconButton(onClick = editFolder, modifier = Modifier.semantics { contentDescription = "Изменить" }) { Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary) }
        }
        if (folder.text("comment").isNotBlank()) Text(folder.text("comment"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        val days = model.templates.filter { it.optInt("folder") == folder.getInt("id") }
        if (days.isEmpty()) Text("Шаблонов пока нет.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        days.forEach { day ->
            var expanded by rememberSaveable(day.optInt("id")) { mutableStateOf(true) }
            var menu by remember { mutableStateOf(false) }
            FitCard(Modifier.testTag("program-day-${day.getInt("id")}").semantics { stateDescription = if (expanded) "Развёрнуто" else "Свёрнуто" }, padding = 18.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(48.dp)) { Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, if (expanded) "Свернуть день" else "Раскрыть день", Modifier.size(18.dp)) }
                    Column(Modifier.weight(1f).clickable { expanded = !expanded }) {
                        Text(day.text("name"), style = MaterialTheme.typography.titleMedium)
                        Text(scheduleLabel(day), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { addExercise(day) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Outlined.Add, "Добавить упражнение", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary) }
                    Box {
                        IconButton(onClick = { menu = true }, modifier = Modifier.size(48.dp)) { Icon(Icons.Outlined.Edit, "Настроить шаблон", Modifier.size(17.dp), tint = MaterialTheme.colorScheme.primary) }
                        DropdownMenu(menu, { menu = false }) {
                            DropdownMenuItem(text = { Text("Изменить день") }, onClick = { menu = false; editDay(day) })
                            DropdownMenuItem(text = { Text("Удалить день") }, onClick = { menu = false; delete("/api/programs/templates/${day.getInt("id")}/") })
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Switch(day.optBoolean("is_active"), { model.save("/api/programs/templates/", obj("is_active" to it), day.getInt("id")) }, enabled = !model.busy, modifier = Modifier.heightIn(min = 48.dp))
                    Text(if (day.optBoolean("is_active")) "День включён" else "День выключен", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (expanded) day.array("template_exercises").forEachIndexed { index, exercise ->
                    val source = exercise.optJSONObject("exercise") ?: exercise.optJSONObject("custom_exercise") ?: JSONObject()
                    var actions by remember { mutableStateOf(false) }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("${index + 1}".padStart(2, '0'), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column(Modifier.weight(1f).clickable { info(exerciseInfoSource(source, folder)) }.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(source.text("name"), style = MaterialTheme.typography.titleSmall)
                            Text(programExerciseSummary(exercise), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!exercise.optBoolean("is_active", true)) Text("Выключено", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (exercise.text("note").isNotBlank()) Text(exercise.text("note"), style = MaterialTheme.typography.bodySmall)
                        }
                        Box {
                            IconButton(onClick = { actions = true }, modifier = Modifier.size(48.dp)) { Icon(Icons.Outlined.Edit, "Редактировать ${source.text("name")}", Modifier.size(17.dp), tint = MaterialTheme.colorScheme.primary) }
                            DropdownMenu(actions, { actions = false }) {
                                DropdownMenuItem(text = { Text("Изменить упражнение") }, onClick = { actions = false; editExercise(day, exercise) })
                                DropdownMenuItem(text = { Text("Техника и описание") }, onClick = { actions = false; info(exerciseInfoSource(source, folder)) })
                                DropdownMenuItem(text = { Text("Переместить выше") }, enabled = index > 0 && !model.busy, onClick = { actions = false; model.reorder(day, index, index - 1) })
                                DropdownMenuItem(text = { Text("Переместить ниже") }, enabled = index < day.array("template_exercises").lastIndex && !model.busy, onClick = { actions = false; model.reorder(day, index, index + 1) })
                                DropdownMenuItem(text = { Text("Удалить упражнение") }, onClick = { actions = false; delete("/api/programs/template-exercises/${exercise.getInt("id")}/") })
                            }
                        }
                    }
                }
            }
        }
    }
}
