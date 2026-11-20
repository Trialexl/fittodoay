package com.fittodoay.android

import androidx.compose.foundation.Canvas
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
import kotlin.math.roundToInt
import org.json.JSONObject

@Composable fun AnalyticsScreen(model: AppModel) {
    var tab by remember { mutableStateOf("load") }
    var detail by remember { mutableStateOf("programs") }
    var chartStyle by remember { mutableStateOf("line") }
    var folderId by remember { mutableStateOf<Int?>(null) }
    var chat by remember { mutableStateOf(false) }
    Page {
        ScreenHeading("Аналитика", "Прогресс и рекомендации", "Следи за нагрузкой и обсуждай тренды с AI-экспертом.")
        Choices("Показатель", tab, listOf("load" to "Нагрузка", "weight" to "Вес тела", "exercises" to "Упражнения")) { tab = it }
        when (tab) {
            "load" -> Panel("Нагрузка по дням") {
                Chart(model.days, "load"); Text("Суммарно: ${"%.2f".format(model.days.sumOf { it.optDouble("load", 0.0) })}")
                model.days.filter { it.optDouble("load", 0.0) > 0 }.sortedByDescending { it.text("date") }.take(5).forEach { day ->
                    TextButton(onClick = { model.date = day.text("date"); model.navigate(Screen.Workout) }, enabled = !model.busy) { Text("${day.text("date")} · ${day.text("load")}") }
                }
            }
            "weight" -> Panel("Динамика веса тела") { Chart(model.weights, "weight_kg"); model.weights.lastOrNull { !it.isNull("weight_kg") }?.let { Text("Последний вес: ${it.text("weight_kg")} кг · ${it.text("date")}") } }
            else -> Panel("Упражнения") { model.exerciseStats.forEach { Text("${it.text("name")} · ${it.text("sets")} подходов · нагрузка ${it.text("load")}") }; if (model.exerciseStats.isEmpty()) Text("Пока нет выполненных подходов") }
        }
        Panel("Динамика по программам") {
            Choices("Период", model.range, listOf("week" to "Неделя", "month" to "Месяц", "half-year" to "Полгода", "year" to "Год")) { if (!model.busy) { model.range = it; model.refresh() } }
            Choices("Группировка", model.granularity, listOf("day" to "День", "week" to "Неделя")) { if (!model.busy) { model.granularity = it; model.refresh() } }
            Choices("Детализация", detail, listOf("programs" to "Программы", "exercises" to "Упражнения")) { detail = it }
            Choices("Вид графика", chartStyle, trendStyles) { chartStyle = it }
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

@Composable fun Chart(rows: List<JSONObject>, metric: String) {
    val data = rows.filter { !it.isNull(metric) && it.optDouble(metric, Double.NaN).isFinite() }
    if (data.isEmpty()) { Text("Нет данных за этот период"); return }
    val values = data.map { it.optDouble(metric).toFloat() }
    val min = if (metric == "weight_kg") (values.minOrNull()!! - 1f).coerceAtLeast(0f) else 0f
    val max = values.maxOrNull()!!.coerceAtLeast(min + 1f)
    val color = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    var selected by remember(rows, metric) { mutableIntStateOf(values.lastIndex) }
    Text("${data[selected.coerceIn(data.indices)].text("date")} · ${"%.2f".format(values[selected.coerceIn(values.indices)])}", style = MaterialTheme.typography.labelLarge)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("${"%.1f".format(min)}"); Text("${"%.1f".format(max)}") }
    Canvas(Modifier.fillMaxWidth().height(160.dp).testTag("chart-$metric").pointerInput(data, metric) {
        detectTapGestures { point -> selected = (point.x / size.width.coerceAtLeast(1) * (values.size - 1)).roundToInt().coerceIn(values.indices) }
    }) {
        repeat(4) { index -> val y = size.height * index / 3; drawLine(grid, Offset(0f, y), Offset(size.width, y)) }
        val points = values.mapIndexed { index, value -> Offset(if (values.size == 1) size.width / 2 else size.width * index / (values.size - 1), size.height * (1 - (value - min) / (max - min))) }
        val path = Path().apply { points.forEachIndexed { i, point -> if (i == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y) } }
        drawPath(path, color, style = Stroke(3.dp.toPx())); points.forEach { drawCircle(color, 3.dp.toPx(), it) }
        points.getOrNull(selected)?.let { drawCircle(color, 6.dp.toPx(), it) }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(data.first().text("date"), style = MaterialTheme.typography.labelSmall); Text(data.last().text("date"), style = MaterialTheme.typography.labelSmall) }
}
