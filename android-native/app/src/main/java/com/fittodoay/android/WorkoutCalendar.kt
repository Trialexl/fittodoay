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
import androidx.compose.foundation.border
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.draw.clip
import java.time.DayOfWeek
import kotlin.math.roundToInt
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import com.kizitonwose.calendar.core.OutDateStyle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalDensity

@Composable fun WorkoutCalendar(model: AppModel, dismiss: () -> Unit) {
    val initial = remember { YearMonth.from(LocalDate.parse(model.date)) }
    val calendar = rememberCalendarState(startMonth = initial.minusYears(100), endMonth = initial.plusYears(100), firstVisibleMonth = initial, firstDayOfWeek = DayOfWeek.MONDAY, outDateStyle = OutDateStyle.EndOfGrid)
    val month = calendar.firstVisibleMonth.yearMonth
    val scope = rememberCoroutineScope()
    val account = model.token
    var saved by remember(month, account) { mutableStateOf<StoredResponse?>(null) }
    var loading by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var localOnly by remember(month, account) { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    val start = month.atDay(1).minusDays((month.atDay(1).dayOfWeek.value - 1).toLong())
    val end = start.plusDays(41)
    val historyFlow = remember(model, account, start) { model.calendarHistory(start.toString(), end.toString()) }
    val history by key(account, start) { historyFlow.collectAsStateWithLifecycle(initialValue = LocalWorkoutHistory()) }
    val loads = remember(saved, history) { calendarLoads(saved, history) }
    val cellHeight = with(LocalDensity.current) { MaterialTheme.typography.bodyMedium.lineHeight.toDp() + MaterialTheme.typography.labelSmall.lineHeight.toDp() + 4.dp }.coerceAtLeast(48.dp)
    LaunchedEffect(month, retry, account) {
        loading = true; error = null; localOnly = false
        try {
            saved = model.savedDailyLoads(start.toString(), end.toString())
            model.api.call("/api/analytics/days/?start=$start&end=$end", useLocalFallback = false)
            saved = model.savedDailyLoads(start.toString(), end.toString())
        }
        catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (e is ApiException && e.status == 401) { model.logout(); return@LaunchedEffect }
            localOnly = true
            error = "Не удалось обновить историю календаря"
        }
        finally { loading = false }
    }
    AlertDialog(containerColor = popupSurfaceColor(), onDismissRequest = dismiss, title = { Text("Выбор даты") }, text = {
        Column(Modifier.testTag("workout-calendar").verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(enabled = month > calendar.startMonth, onClick = { scope.launch { calendar.animateScrollToMonth(month.minusMonths(1)) } }) { Icon(Icons.Outlined.ChevronLeft, "Предыдущий месяц") }
                Text(month.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.forLanguageTag("ru"))), Modifier.weight(1f).padding(top = 12.dp), style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
                IconButton(enabled = month < calendar.endMonth, onClick = { scope.launch { calendar.animateScrollToMonth(month.plusMonths(1)) } }) { Icon(Icons.Outlined.ChevronRight, "Следующий месяц") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().testTag("calendar-loading"))
            error?.let {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (localOnly && (saved != null || history.days.isNotEmpty())) "Сохранённые данные" else it, Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = { retry++ }, Modifier.size(44.dp)) { Icon(Icons.Outlined.Refresh, "Повторить загрузку календаря", Modifier.size(20.dp)) }
                }
            }
            Row { listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center) } }
            HorizontalCalendar(state = calendar, dayContent = { day ->
                val date = day.date; val selected = date.toString() == model.date
                val today = date == LocalDate.now()
                Box(Modifier.fillMaxWidth().height(cellHeight).clip(RoundedCornerShape(10.dp))
                    .then(if (selected) Modifier.background(MaterialTheme.colorScheme.primaryContainer) else Modifier)
                    .then(if (today && !selected) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(10.dp)) else Modifier)
                    .testTag("calendar-date-$date").semantics { contentDescription = date.toString(); this.selected = selected; if (today) stateDescription = "Сегодня" }
                    .clickable(enabled = !model.busy) { model.date = date.toString(); model.refresh(); dismiss() }, contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(date.dayOfMonth.toString(), style = MaterialTheme.typography.bodyMedium,
                            color = if (day.position == DayPosition.MonthDate) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
                        Text(loads[date.toString()]?.let { if (it == 0.0) "—" else it.roundToInt().toString() } ?: "·", Modifier.testTag("calendar-load-$date"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            })
            Text("Под датой — фактическая нагрузка", style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { TextButton(onClick = { model.date = LocalDate.now().toString(); model.refresh(); dismiss() }, enabled = !model.busy) { Text("Сегодня") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Закрыть") } })
}
