package com.fittodoay.android

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import sh.calvin.reorderable.*
import java.time.LocalDate

/** Local draft order; the standard reorder library owns dragging, animation and edge scrolling. */
@Composable fun DayDialog(day: JSONObject, model: AppModel, dismiss: () -> Unit) {
    var name by remember { mutableStateOf(day.text("name")) }
    var comment by remember { mutableStateOf(day.text("comment")) }
    var type by remember { mutableStateOf(day.text("schedule_type", "weekly")) }
    val config = day.optJSONObject("schedule_config") ?: JSONObject()
    var weekdays by remember { mutableStateOf((config.optJSONArray("days_of_week") ?: JSONArray().put(LocalDate.now().dayOfWeek.value - 1)).let { a -> (0 until a.length()).map { a.getInt(it) }.toSet() }) }
    var start by remember { mutableStateOf(config.text("start_date", LocalDate.now().toString())) }
    var interval by remember { mutableStateOf(config.text(if (type == "biweekly") "week_interval" else "every_x_days", "2")) }
    var dates by remember { mutableStateOf(config.optJSONArray("specific_dates")?.join(", ")?.replace("\"", "").orEmpty()) }
    var exercises by remember { mutableStateOf(day.array("template_exercises")) }
    val listState = rememberLazyListState()
    val haptic = LocalHapticFeedback.current
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val source = exercises.indexOfFirst { it.optInt("id") == from.key }
        val target = exercises.indexOfFirst { it.optInt("id") == to.key }
        if (!model.busy && source >= 0 && target >= 0) {
            exercises = exercises.toMutableList().apply { add(target, removeAt(source)) }
            haptic.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
        }
    }
    fun move(from: Int, to: Int): Boolean {
        if (model.busy || to !in exercises.indices) return false
        exercises = exercises.toMutableList().apply { add(to, removeAt(from)) }
        return true
    }
    DetailSurface("День тренировки", tag = "day-editor", dismiss = dismiss, compact = true) {
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("day-editor-list"), state = listState,
            verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 12.dp)) {
            item(key = "fields") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Field("Название", name, { name = it }); Field("Комментарий", comment, { comment = it })
                    CompactSelector("Расписание", type, listOf("weekly" to "По неделям", "biweekly" to "Раз в N недель", "interval" to "Через X дней", "custom" to "Даты")) { type = it }
                    if (type == "weekly" || type == "biweekly") Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEachIndexed { index, label ->
                            FilterChip(index in weekdays, { weekdays = if (index in weekdays) weekdays - index else weekdays + index }, label = { Text(label) })
                        }
                    }
                    if (type == "biweekly" || type == "interval") { Field("Дата старта ГГГГ-ММ-ДД", start, { start = it }); Field("Интервал", interval, { interval = it }) }
                    if (type == "custom") Field("Даты через запятую ГГГГ-ММ-ДД", dates, { dates = it })
                    if (exercises.isNotEmpty()) {
                        Text("Порядок упражнений", style = MaterialTheme.typography.titleSmall)
                        Text("Перетащите за значок справа. Порядок сохранится вместе с днём.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            itemsIndexed(exercises, key = { _, exercise -> exercise.getInt("id") }) { index, exercise ->
                ReorderableItem(reorder, key = exercise.getInt("id")) { dragging ->
                    val elevation by animateDpAsState(if (dragging) 6.dp else 0.dp, label = "exercise-drag")
                    val source = exercise.optJSONObject("exercise") ?: exercise.optJSONObject("custom_exercise") ?: JSONObject()
                    Surface(Modifier.fillMaxWidth().testTag("day-order-${exercise.getInt("id")}").semantics {
                        stateDescription = "Позиция ${index + 1} из ${exercises.size}"
                        customActions = listOf(CustomAccessibilityAction("Выше") { move(index, index - 1) }, CustomAccessibilityAction("Ниже") { move(index, index + 1) })
                    }, shape = MaterialTheme.shapes.small, color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface, shadowElevation = elevation) {
                        Row(Modifier.padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("${index + 1}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(source.text("name"), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(programExerciseSummary(exercise), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = {}, enabled = !model.busy, modifier = Modifier.size(48.dp).testTag("drag-exercise-${exercise.getInt("id")}").draggableHandle(
                                onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate) },
                                onDragStopped = { haptic.performHapticFeedback(HapticFeedbackType.GestureEnd) })) {
                                Icon(Icons.Outlined.DragHandle, "Переместить ${source.text("name")}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = dismiss, modifier = Modifier.weight(1f), enabled = !model.busy) { Text("Отмена") }
            Button(onClick = {
                val schedule = try { scheduleConfig(type, weekdays, start, interval, dates) } catch (e: IllegalArgumentException) { model.error = e.message; return@Button }
                model.saveDay(day, obj("folder" to day.getInt("folder"), "name" to name.trim(), "comment" to comment, "schedule_type" to type, "schedule_config" to schedule), exercises.map { it.getInt("id") }, dismiss)
            }, modifier = Modifier.weight(1f), enabled = !model.busy && name.isNotBlank() && (type !in listOf("weekly", "biweekly") || weekdays.isNotEmpty())) { Text("Сохранить") }
        }
    }
}
