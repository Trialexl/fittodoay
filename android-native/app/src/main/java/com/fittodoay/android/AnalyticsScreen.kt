package com.fittodoay.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.layout.onGloballyPositioned
import kotlin.math.roundToInt
import org.json.JSONObject

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable fun AnalyticsScreen(model: AppModel) {
    var detail by remember { mutableStateOf("programs") }
    var chartStyle by remember { mutableStateOf("line") }
    var folderId by remember { mutableStateOf<Int?>(null) }
    var chat by remember { mutableStateOf(false) }
    val weightFocus = remember { BringIntoViewRequester() }
    var weightReady by remember { mutableStateOf(false) }
    LaunchedEffect(model.focusBodyWeight, model.busy, weightReady) {
        if (model.focusBodyWeight && !model.busy && weightReady) { weightFocus.bringIntoView(); model.focusBodyWeight = false }
    }
    Page {
        ScreenHeading("Аналитика", "Прогресс и рекомендации", "Следи за нагрузкой и обсуждай тренды с AI-экспертом.")
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val stack = maxWidth < 340.dp || androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.2f
            val metrics: @Composable (Modifier) -> Unit = { itemModifier ->
                AnalyticsMetric("Тренировок с нагрузкой", model.days.count { it.optDouble("load", 0.0) > 0 }.toString(), "В доступной истории", true, itemModifier)
                AnalyticsMetric("Подходов выполнено", model.exerciseStats.sumOf { it.optInt("sets") }.toString(), "По упражнениям в истории", false, itemModifier)
                AnalyticsMetric("Последний вес", model.weights.lastOrNull { !it.isNull("weight_kg") }?.text("weight_kg")?.plus(" кг") ?: "—", "Последнее измерение", false, itemModifier)
            }
            if (stack) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { metrics(Modifier.fillMaxWidth()) }
            else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { metrics(Modifier.weight(1f)) }
        }
        Panel("Нагрузка по дням") {
            val loaded = model.days.filter { it.optDouble("load", 0.0) > 0 }
            if (loaded.isEmpty()) Text("Нет дней с ненулевой нагрузкой за выбранный период.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                loaded.forEach { day -> TextButton(onClick = { model.date = day.text("date"); model.navigate(Screen.Workout) }, enabled = !model.busy,
                    colors = ButtonDefaults.textButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface)) {
                    Column(Modifier.padding(4.dp)) {
                        Text(day.text("date"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(day.text("load"), style = MaterialTheme.typography.titleMedium)
                    }
                } }
            }
        }
        Panel("Топ упражнений") {
            if (model.exerciseStats.isEmpty()) Text("Пока нет выполненных подходов", color = MaterialTheme.colorScheme.onSurfaceVariant)
            model.exerciseStats.sortedByDescending { it.optDouble("load", 0.0) }.forEach {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(it.text("name"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    Text(it.text("load"), style = MaterialTheme.typography.titleSmall)
                }
                Text("${it.text("sets")} подходов", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Panel("Вес тела", Modifier.testTag("analytics-body-weight").bringIntoViewRequester(weightFocus).onGloballyPositioned { weightReady = true }) { Chart(model.weights, "weight_kg") }
        Panel("Динамика по программам") {
            SegmentedOptions(model.range, listOf("week" to "Неделя", "month" to "Месяц", "half-year" to "Полгода", "year" to "Год")) { if (!model.busy) { model.range = it; model.refresh() } }
            SegmentedOptions(model.granularity, listOf("day" to "День", "week" to "Неделя")) { if (!model.busy) { model.granularity = it; model.refresh() } }
            Text("Детализация", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SegmentedOptions(detail, listOf("programs" to "Программы", "exercises" to "Упражнения")) { detail = it }
            Text("Вид графика", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SegmentedOptions(chartStyle, trendStyles) { chartStyle = it }
            if (detail == "exercises") model.trends.array("folders").forEach { folder ->
                FilterChip((folderId ?: model.trends.array("folders").firstOrNull()?.optInt("id")) == folder.optInt("id"), { folderId = folder.optInt("id") }, label = { Text(folder.text("name")) })
            }
            TrendChart(trendLines(model.trends, detail == "exercises", folderId), chartStyle)
        }
        if (model.folders.isNotEmpty()) Panel("AI-анализ") {
            Text("Выберите программу, чтобы обсудить результаты и нагрузку.")
            model.folders.forEach { folder -> TextButton(onClick = { chat = true; model.openChat(folder.getInt("id"), "post_workout_review", "Коротко разбери статистику выбранной программы и объясни решения анализа. Учитывай разные тренировочные дни, полноту данных и возможный перерыв. Различай план, фактические результаты и предложения.") }, enabled = !model.busy) { Text(folder.text("name")) } }
        }
    }
    if (chat) ChatDialog(model) { chat = false }
}

@Composable private fun AnalyticsMetric(title: String, value: String, caption: String, dark: Boolean, modifier: Modifier) {
    Surface(modifier.heightIn(min = 120.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
        color = if (dark) Color(0xff202633) else MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.bodySmall, color = if (dark) Color(0xffd1d7e3) else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.headlineSmall, color = if (dark) Color.White else MaterialTheme.colorScheme.onSurface)
            Text(caption, style = MaterialTheme.typography.labelSmall, color = if (dark) Color(0xffb0bacd) else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable fun Chart(rows: List<JSONObject>, metric: String) {
    val data = rows.filter { !it.isNull(metric) && it.optDouble(metric, Double.NaN).isFinite() }.sortedBy { it.text("date") }
    val label = when (metric) { "weight_kg" -> "Вес тела, кг"; "avg_weight" -> "Средний вес, кг"; else -> "Нагрузка" }
    val line = TrendLine(metric, label, data.associate { it.text("date") to it.optDouble(metric) })
    MetricPlot(listOf(line), "line", "chart-$metric", label, zero = metric == "load")
}
