package com.fittodoay.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@Composable fun WorkoutCalendar(model: AppModel, dismiss: () -> Unit) {
    var month by remember { mutableStateOf(YearMonth.from(LocalDate.parse(model.date))) }
    var loads by remember { mutableStateOf<Map<String, Double>>(emptyMap()) }
    var loading by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    val start = month.atDay(1).minusDays((month.atDay(1).dayOfWeek.value - 1).toLong())
    LaunchedEffect(month, retry) {
        loading = true; error = null; loads = emptyMap()
        try { loads = model.api.call("/api/analytics/days/?start=$start&end=${start.plusDays(41)}").rows().associate { it.text("date") to it.optDouble("load", 0.0) } }
        catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; error = "Не удалось загрузить нагрузку календаря" }
        finally { loading = false }
    }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Календарь тренировок") }, text = {
        Column(Modifier.testTag("workout-calendar"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { month = month.minusMonths(1) }) { Text("←") }
                Text(month.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.forLanguageTag("ru"))), Modifier.padding(top = 12.dp))
                TextButton(onClick = { month = month.plusMonths(1) }) { Text("→") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error); TextButton(onClick = { retry++ }) { Text("Повторить") } }
            Row { listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall) } }
            repeat(6) { week -> Row {
                repeat(7) { day -> val date = start.plusDays((week * 7 + day).toLong()); val selected = date.toString() == model.date
                    Surface(Modifier.weight(1f), color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface) {
                        TextButton(onClick = { model.date = date.toString(); model.refresh(); dismiss() }, modifier = Modifier.testTag("calendar-date-$date").semantics { contentDescription = date.toString() }, contentPadding = PaddingValues(vertical = 4.dp), enabled = !model.busy) {
                            Column { Text(date.dayOfMonth.toString(), color = if (YearMonth.from(date) == month) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
                                Text(loads[date.toString()]?.roundToInt()?.toString() ?: "·", style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                }
            } }
            Text("Под датой — фактическая нагрузка", style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { TextButton(onClick = { model.date = LocalDate.now().toString(); model.refresh(); dismiss() }, enabled = !model.busy) { Text("Сегодня") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Закрыть") } })
}
