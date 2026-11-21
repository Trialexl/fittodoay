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
import com.kizitonwose.calendar.compose.HorizontalCalendar
import com.kizitonwose.calendar.compose.rememberCalendarState
import com.kizitonwose.calendar.core.DayPosition
import kotlinx.coroutines.launch
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.draw.clip
import java.time.DayOfWeek
import kotlin.math.roundToInt

@Composable fun WorkoutCalendar(model: AppModel, dismiss: () -> Unit) {
    val initial = remember { YearMonth.from(LocalDate.parse(model.date)) }
    val calendar = rememberCalendarState(startMonth = initial.minusYears(100), endMonth = initial.plusYears(100), firstVisibleMonth = initial, firstDayOfWeek = DayOfWeek.MONDAY)
    val month = calendar.firstVisibleMonth.yearMonth
    val scope = rememberCoroutineScope()
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
                IconButton(enabled = month > calendar.startMonth, onClick = { scope.launch { calendar.animateScrollToMonth(month.minusMonths(1)) } }) { Icon(Icons.Outlined.ChevronLeft, "Предыдущий месяц") }
                Text(month.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.forLanguageTag("ru"))), Modifier.weight(1f).padding(top = 12.dp), style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
                IconButton(enabled = month < calendar.endMonth, onClick = { scope.launch { calendar.animateScrollToMonth(month.plusMonths(1)) } }) { Icon(Icons.Outlined.ChevronRight, "Следующий месяц") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().testTag("calendar-loading"))
            error?.let { Text(it, color = MaterialTheme.colorScheme.error); TextButton(onClick = { retry++ }) { Text("Повторить") } }
            Row { listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center) } }
            HorizontalCalendar(state = calendar, dayContent = { day ->
                val date = day.date; val selected = date.toString() == model.date
                Box(Modifier.fillMaxWidth().aspectRatio(.85f).clip(RoundedCornerShape(10.dp))
                    .then(if (selected) Modifier.background(MaterialTheme.colorScheme.primaryContainer) else Modifier)
                    .testTag("calendar-date-$date").semantics { contentDescription = date.toString() }
                    .clickable(enabled = !model.busy) { model.date = date.toString(); model.refresh(); dismiss() }, contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(date.dayOfMonth.toString(), style = MaterialTheme.typography.bodyMedium,
                            color = if (day.position == DayPosition.MonthDate) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
                        Text(loads[date.toString()]?.roundToInt()?.toString() ?: "·", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            })
            Text("Под датой — фактическая нагрузка", style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { TextButton(onClick = { model.date = LocalDate.now().toString(); model.refresh(); dismiss() }, enabled = !model.busy) { Text("Сегодня") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Закрыть") } })
}
