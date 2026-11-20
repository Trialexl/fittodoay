package com.fittodoay.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import kotlin.math.*

data class TrendLine(val key: String, val label: String, val points: Map<String, Double?>)
fun trendLines(trends: JSONObject, exercises: Boolean, folderId: Int?): List<TrendLine> {
    val folders = trends.array("folders")
    val entries = if (exercises) (folders.firstOrNull { it.optInt("id") == folderId } ?: folders.firstOrNull())?.array("exercises").orEmpty() else folders
    return entries.map { entry -> TrendLine(
        entry.text(if (exercises) "template_exercise_id" else "id"),
        if (exercises) "${entry.text("exercise_name")} · ${entry.text("template_name")}" else entry.text("name"),
        entry.array("series").associate { it.text("date") to if (it.isNull("load")) null else it.optDouble("load").takeIf(Double::isFinite) }) }
}
/** Same missing-point interpolation as the web trend charts; zeros remain real zeros. */
fun interpolateTrend(values: List<Double?>): List<Double> {
    val known = values.indices.filter { values[it] != null }
    if (known.isEmpty()) return values.map { 0.0 }
    return values.indices.map { index ->
        values[index] ?: run {
            val left = known.lastOrNull { it < index }; val right = known.firstOrNull { it > index }
            when { left == null -> values[right!!]!!; right == null -> values[left]!!
                else -> values[left]!! + (values[right]!! - values[left]!!) * (index - left) / (right - left) }
        }
    }
}
private val trendColors = listOf(Color(0xff7c3aed), Color(0xfff97316), Color(0xff0ea5e9), Color(0xff22c55e), Color(0xffec4899), Color(0xff64748b), Color(0xffeab308), Color(0xff14b8a6))
val trendStyles = listOf("line" to "Линия", "area" to "Площадь", "stacked" to "Сложение", "columns" to "Столбцы", "heatmap" to "Тепло", "pie" to "Круг", "radar" to "Радар")

@Composable fun TrendChart(lines: List<TrendLine>, style: String) {
    var focus by remember(lines) { mutableStateOf<String?>(null) }
    val shown = lines.filter { focus == null || it.key == focus }
    val dates = shown.flatMap { it.points.keys }.distinct().sorted()
    if (dates.isEmpty() || shown.none { it.points.values.any { value -> value != null } }) { Text("В выбранном периоде данных пока нет"); return }
    val data = shown.map { line -> interpolateTrend(dates.map { line.points[it] }) }
    val maximum = (if (style == "stacked") dates.indices.maxOf { date -> data.sumOf { it[date] } } else data.maxOf { it.maxOrNull() ?: 0.0 }).coerceAtLeast(1.0)
    var point by remember(lines, style) { mutableIntStateOf(dates.lastIndex) }
    var seriesIndex by remember(lines, style) { mutableIntStateOf(0) }
    val selected = point.coerceIn(dates.indices)
    val totals = shown.map { line -> line.points.values.filterNotNull().sum() }
    val total = totals.sum()
    fun color(index: Int) = trendColors[lines.indexOf(shown[index]).coerceAtLeast(0) % trendColors.size]
    Text(if (style == "pie") "Нагрузка за период: ${"%.2f".format(total)}" else "${dates[selected]} · максимум ${"%.1f".format(maximum)}", style = MaterialTheme.typography.labelLarge)
    Canvas(Modifier.fillMaxWidth().height(if (style == "heatmap") (shown.size * 28).coerceIn(150, 360).dp else 240.dp)
        .testTag("trend-chart-$style").pointerInput(dates, shown, style) {
            detectTapGestures { touch ->
                if (style == "pie") {
                    val angle = ((atan2(touch.y - size.height / 2f, touch.x - size.width / 2f) * 180 / PI + 450) % 360)
                    var sum = 0.0
                    seriesIndex = totals.indices.firstOrNull { sum += if (total > 0) totals[it] / total * 360 else 0.0; angle < sum } ?: 0
                } else if (style == "radar") {
                    val angle = (atan2(touch.y - size.height / 2f, touch.x - size.width / 2f) + PI / 2 + 2 * PI) % (2 * PI)
                    point = (angle / (2 * PI) * dates.size).roundToInt() % dates.size
                } else {
                    point = (touch.x / size.width.coerceAtLeast(1) * (dates.size - 1)).roundToInt().coerceIn(dates.indices)
                    seriesIndex = (touch.y / size.height.coerceAtLeast(1) * shown.size).toInt().coerceIn(shown.indices)
                }
            }
        }) {
        fun x(i: Int) = if (dates.size == 1) size.width / 2 else size.width * i / (dates.size - 1)
        fun y(value: Double) = (size.height * (1 - value / maximum)).toFloat()
        if (style == "pie") {
            var angle = -90f; val radius = min(size.width, size.height)
            totals.forEachIndexed { i, value -> val sweep = if (total > 0) (value / total * 360).toFloat() else 0f
                drawArc(color(i), angle, sweep, true, Offset((size.width - radius) / 2, (size.height - radius) / 2), Size(radius, radius)); angle += sweep }
        } else if (style == "radar") {
            val radius = min(size.width, size.height) * .45f; val center = Offset(size.width / 2, size.height / 2)
            fun radial(index: Int, value: Double): Offset { val angle = 2 * PI * index / dates.size - PI / 2
                return center + Offset((cos(angle) * radius * value / maximum).toFloat(), (sin(angle) * radius * value / maximum).toFloat()) }
            repeat(4) { ring -> val path = Path(); dates.indices.forEach { i -> val p = radial(i, maximum * (ring + 1) / 4)
                if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }; path.close(); drawPath(path, Color.Gray.copy(alpha = .25f), style = Stroke(1.dp.toPx())) }
            data.forEachIndexed { i, values -> val path = Path(); values.forEachIndexed { j, value -> val p = radial(j, value)
                if (j == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
                path.close(); drawPath(path, color(i).copy(alpha = .2f)); drawPath(path, color(i), style = Stroke(2.dp.toPx()))
                drawCircle(color(i), 5.dp.toPx(), radial(selected, values[selected])) }
        } else if (style == "heatmap") {
            val width = size.width / dates.size; val height = size.height / shown.size
            data.forEachIndexed { i, values -> values.forEachIndexed { j, value ->
                drawRect(color(i).copy(alpha = (.08 + .92 * value / maximum).toFloat()), Offset(j * width, i * height), Size(width.coerceAtLeast(1f), (height - 2.dp.toPx()).coerceAtLeast(1f))) } }
            drawLine(Color.Gray, Offset(selected * width, 0f), Offset(selected * width, size.height), 2.dp.toPx())
        } else {
            repeat(4) { i -> drawLine(Color.Gray.copy(alpha = .25f), Offset(0f, size.height * i / 3), Offset(size.width, size.height * i / 3)) }
            val accumulated = DoubleArray(dates.size)
            data.forEachIndexed { i, values ->
                if (style == "columns") {
                    val width = size.width / dates.size / shown.size
                    values.forEachIndexed { j, value -> drawRect(color(i), Offset(j * size.width / dates.size + i * width, y(value)), Size((width * .85f).coerceAtLeast(1f), (size.height - y(value)).coerceAtLeast(0f))) }
                } else {
                    val base = accumulated.copyOf()
                    val path = Path(); values.forEachIndexed { j, value -> val top = value + if (style == "stacked") base[j] else 0.0
                        if (j == 0) path.moveTo(x(j), y(top)) else path.lineTo(x(j), y(top)); accumulated[j] = top }
                    if (style in listOf("area", "stacked")) {
                        val fill = Path().apply { addPath(path); dates.indices.reversed().forEach { j -> lineTo(x(j), y(if (style == "stacked") base[j] else 0.0)) }; close() }
                        drawPath(fill, color(i).copy(alpha = .3f))
                    }
                    drawPath(path, color(i), style = Stroke(2.dp.toPx()))
                    drawCircle(color(i), 4.dp.toPx(), Offset(x(selected), y(values[selected] + if (style == "stacked") base[selected] else 0.0)))
                }
            }
        }
    }
    if (style != "pie") Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(dates.first(), style = MaterialTheme.typography.labelSmall); Text(dates.last(), style = MaterialTheme.typography.labelSmall)
    }
    shown.forEachIndexed { i, line ->
        val value = if (style == "pie") totals[i] else line.points[dates[selected]]
        Text("${if (style == "pie" && i == seriesIndex) "● " else ""}${line.label}: ${value?.let { "%.2f".format(it) } ?: "нет записи"}", color = color(i), style = MaterialTheme.typography.bodySmall)
    }
    Text("Нажмите название, чтобы выделить ряд", style = MaterialTheme.typography.labelSmall)
    lines.forEachIndexed { i, line -> FilterChip(focus == line.key, { focus = if (focus == line.key) null else line.key }, label = { Text(line.label, color = trendColors[i % trendColors.size]) }) }
}
