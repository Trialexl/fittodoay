package com.fittodoay.android

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.layout.onGloballyPositioned
import org.json.JSONObject
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.Alignment
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.clickable
import androidx.compose.ui.text.style.TextOverflow
import java.time.LocalDate

val analyticsRanges = listOf("week" to "Неделя", "month" to "Месяц", "half-year" to "Полгода", "year" to "Год")
fun analyticsRangeQuery(range: String, today: LocalDate = LocalDate.now()): String {
    val days = when (range) { "week" -> 6L; "half-year" -> 179L; "year" -> 364L; else -> 29L }
    return "start=${today.minusDays(days)}&end=$today"
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable fun AnalyticsScreen(model: AppModel) {
    var detail by rememberSaveable { mutableStateOf("programs") }
    var chartStyle by rememberSaveable { mutableStateOf("line") }
    var folderId by rememberSaveable { mutableStateOf<Int?>(null) }
    var settings by remember { mutableStateOf(false) }
    var allExercises by rememberSaveable { mutableStateOf(false) }
    var chat by remember { mutableStateOf(false) }
    val weightFocus = remember { BringIntoViewRequester() }
    var weightReady by remember { mutableStateOf(false) }
    LaunchedEffect(model.focusBodyWeight, model.busy, weightReady) {
        if (model.focusBodyWeight && !model.busy && weightReady) { weightFocus.bringIntoView(); model.focusBodyWeight = false }
    }
    Page {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Прогресс", Modifier.weight(1f), style = MaterialTheme.typography.headlineLarge)
            CompactSelector("Период", model.range, analyticsRanges) { if (!model.refreshing) { model.range = it; model.refresh() } }
        }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val stack = maxWidth < 340.dp || androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.2f
            val metrics: @Composable (Modifier) -> Unit = { itemModifier ->
                AnalyticsMetric("Тренировки", model.days.count { it.optDouble("load", 0.0) > 0 }.toString(), itemModifier)
                AnalyticsMetric("Подходы", model.exerciseStats.sumOf { it.optInt("sets") }.toString(), itemModifier)
                AnalyticsMetric("Вес, кг", model.weights.lastOrNull { !it.isNull("weight_kg") }?.optDouble("weight_kg")?.let(::plotPointNumber) ?: "—", itemModifier)
            }
            if (stack) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { metrics(Modifier.fillMaxWidth()) }
            else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { metrics(Modifier.weight(1f)) }
        }
        Panel("Нагрузка по дням") {
            val loaded = model.days.filter { it.optDouble("load", 0.0) > 0 }
            if (loaded.isEmpty()) Text("Нет дней с ненулевой нагрузкой за выбранный период.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else Chart(model.days, "load")
        }
        FitCard(Modifier.testTag("top-exercises")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Топ упражнений", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                if (model.exerciseStats.size > 5) TextButton(onClick = { allExercises = !allExercises }) { Text(if (allExercises) "Свернуть" else "Все · ${model.exerciseStats.size}", style = MaterialTheme.typography.bodySmall) }
            }
            if (model.exerciseStats.isEmpty()) Text("Пока нет выполненных подходов", color = MaterialTheme.colorScheme.onSurfaceVariant)
            model.exerciseStats.sortedByDescending { it.optDouble("load", 0.0) }.take(if (allExercises) Int.MAX_VALUE else 5).forEachIndexed { index, exercise ->
                Row(Modifier.fillMaxWidth().testTag("top-exercise-$index"), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("${index + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f)) {
                        Text(exercise.text("name"), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("Подходы: ${exercise.optInt("sets")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(plotNumber(exercise.optDouble("load", 0.0)), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Panel("Вес тела", Modifier.testTag("analytics-body-weight").bringIntoViewRequester(weightFocus).onGloballyPositioned { weightReady = true }) { Chart(model.weights, "weight_kg") }
        FitCard {
            val chartLines = trendLines(model.trends, detail == "exercises", folderId)
            Row(Modifier.fillMaxWidth().testTag("chart-toolbar"), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (detail == "programs") "Динамика программ" else "Динамика упражнений", style = MaterialTheme.typography.titleMedium)
                    Text("${trendStyles.first { it.first == chartStyle }.second} · ${if (usesMonthlyRadar(chartLines, chartStyle)) "по месяцам" else if (model.granularity == "week") "по неделям" else "по дням"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { settings = true }) { Icon(Icons.Outlined.Tune, "Параметры графика") }
            }
            TrendChart(chartLines, chartStyle)
        }
        if (model.folders.isNotEmpty()) Panel("AI-анализ") {
            Text("Выберите программу, чтобы обсудить результаты и нагрузку.")
            model.folders.forEach { folder -> TextButton(onClick = { chat = true; model.openChat(folder.getInt("id"), "post_workout_review", "Коротко разбери статистику выбранной программы и объясни решения анализа. Учитывай разные тренировочные дни, полноту данных и возможный перерыв. Различай план, фактические результаты и предложения.") }, enabled = !model.busy) { Text(folder.text("name")) } }
        }
    }
    if (settings) ModalBottomSheet(onDismissRequest = { settings = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Параметры графика", style = MaterialTheme.typography.titleLarge)
            CompactSelector("Период", model.range, analyticsRanges) { if (!model.refreshing) { model.range = it; model.refresh() } }
            Choices("Группировка", model.granularity, listOf("day" to "Дни", "week" to "Недели")) { if (!model.refreshing) { model.granularity = it; model.refresh() } }
            Choices("Детализация", detail, listOf("programs" to "Программы", "exercises" to "Упражнения")) { detail = it }
            CompactSelector("Вид графика", chartStyle, trendStyles) { chartStyle = it }
            if (detail == "exercises") CompactSelector("Программа", (folderId ?: model.trends.array("folders").firstOrNull()?.optInt("id")).toString(), model.trends.array("folders").map { it.text("id") to it.text("name") }) { folderId = it.toIntOrNull() }
            Button(onClick = { settings = false }, Modifier.fillMaxWidth()) { Text("Готово") }
        }
    }
    if (chat) ChatDialog(model) { chat = false }
}

@Composable private fun AnalyticsMetric(title: String, value: String, modifier: Modifier) {
    Surface(modifier, shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable fun Chart(rows: List<JSONObject>, metric: String) {
    val data = rows.filter { !it.isNull(metric) && it.optDouble(metric, Double.NaN).isFinite() }.sortedBy { it.text("date") }
    val label = when (metric) { "weight_kg" -> "Вес тела, кг"; "avg_weight" -> "Средний вес, кг"; else -> "Нагрузка" }
    val line = TrendLine(metric, label, data.associate { it.text("date") to it.optDouble(metric) })
    MetricPlot(listOf(line), "line", "chart-$metric", label, zero = metric == "load")
}
