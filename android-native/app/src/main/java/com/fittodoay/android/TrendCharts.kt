package com.fittodoay.android

import androidx.compose.runtime.Composable
import org.json.JSONObject

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
/** Vico draws cumulative areas from back to front; selection always uses original records. */
fun stackedTrendValues(values: List<List<Double>>): List<List<Double>> = values.indices.reversed().map { series ->
    values[series].indices.map { point -> (0..series).sumOf { values[it][point] } }
}

val trendStyles = listOf("line" to "Линия", "area" to "Площадь", "stacked" to "Сложение", "columns" to "Столбцы", "heatmap" to "Тепло", "pie" to "Круг", "radar" to "Радар")

@Composable fun TrendChart(lines: List<TrendLine>, style: String) {
    MetricPlot(lines, style, "trend-chart-$style", zero = style != "line")
}
