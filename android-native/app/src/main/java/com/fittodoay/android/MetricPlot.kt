package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.*

data class ChartDomain(val minimum: Double, val maximum: Double, val intervals: Int = 4)
fun chartDomain(values: List<Double>, zero: Boolean): ChartDomain {
    val finite = values.filter(Double::isFinite)
    if (finite.isEmpty()) return ChartDomain(0.0, 1.0)
    val low = finite.min(); val high = finite.max()
    val margin = if (high == low) max(abs(high) * .04, 1.0) else (high - low) * .08
    val min = if (zero) min(0.0, low) else if (low >= 0) max(0.0, low - margin) else low - margin
    val max = max(high + margin, min + 1.0)
    val raw = (max - min) / 4
    val magnitude = 10.0.pow(floor(log10(raw)))
    val step = listOf(1.0, 2.0, 2.5, 5.0, 10.0).first { it * magnitude >= raw } * magnitude
    val lower = floor(min / step) * step
    val intervals = ceil((max - lower) / step).toInt().coerceAtLeast(1)
    return ChartDomain(lower, lower + intervals * step, intervals)
}
fun plotNumber(value: Double): String = when {
    abs(value) >= 1_000_000 -> String.format(Locale.forLanguageTag("ru"), "%.1fм", value / 1_000_000)
    abs(value) >= 10_000 -> String.format(Locale.forLanguageTag("ru"), "%.1fк", value / 1000)
    value == floor(value) -> value.toLong().toString()
    else -> String.format(Locale.forLanguageTag("ru"), "%.2f", value).trimEnd('0').trimEnd(',')
}
fun plotDate(date: String): String = runCatching { java.time.LocalDate.parse(date).format(java.time.format.DateTimeFormatter.ofPattern("dd.MM")) }.getOrDefault(date)

/** Shared axes, selection, and legend for dashboard, body weight, and exercise statistics. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun MetricPlot(lines: List<TrendLine>, style: String, tag: String, label: String = "Нагрузка", zero: Boolean = true) {
    var focus by remember(lines) { mutableStateOf<String?>(null) }
    val shown = lines.filter { focus == null || focus == it.key }
    val dates = shown.flatMap { it.points.keys }.distinct().sorted()
    if (dates.isEmpty() || shown.none { it.points.values.any { v -> v != null } }) {
        Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Данные ещё появятся", style = MaterialTheme.typography.titleSmall)
            Text("Выполните подход или выберите другой период", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val data = shown.map { line -> interpolateTrend(dates.map { line.points[it] }) }
    val totals = shown.map { it.points.values.filterNotNull().sum() }
    val total = totals.sum()
    val domain = chartDomain(if (style == "stacked") dates.indices.map { d -> data.sumOf { it[d] } } else data.flatten(), zero || style in listOf("area", "stacked", "columns", "radar"))
    var point by remember(dates, style) { mutableIntStateOf(dates.lastIndex) }
    var seriesIndex by remember(lines, style) { mutableIntStateOf(0) }
    val selected = point.coerceIn(dates.indices)
    val accent = MaterialTheme.colorScheme.primary
    val palette = listOf(accent, Color(0xff16a6a0), Color(0xffee9d36), Color(0xffe46a8b), Color(0xff6489dd), Color(0xffa18b6e))
    fun color(i: Int) = palette[lines.indexOf(shown[i]).coerceAtLeast(0) % palette.size]
    val grid = MaterialTheme.colorScheme.outlineVariant
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.testTag("$tag-panel"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(label, style = MaterialTheme.typography.labelSmall, color = muted)
                val selectedValues = shown.mapNotNull { it.points[dates[selected]] }
                Text(if (style == "pie") plotNumber(total) else if (selectedValues.isNotEmpty()) plotNumber(selectedValues.sum()) else "Нет записи", style = MaterialTheme.typography.headlineSmall)
            }
            Surface(shape = RoundedCornerShape(9.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Text(if (style == "pie") "За период" else plotDate(dates[selected]), Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelSmall, color = muted)
            }
        }
        Surface(shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, grid.copy(alpha = .7f)), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(top = 18.dp, bottom = 12.dp, start = 8.dp, end = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val cartesian = style !in listOf("pie", "radar", "heatmap")
                val chartHeight = if (style == "heatmap") (shown.size * 32).coerceIn(64, 400).dp else 220.dp
                Row {
                    if (cartesian) Column(Modifier.width(38.dp).height(chartHeight), verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.End) {
                        repeat(domain.intervals + 1) { i -> Text(plotNumber(domain.maximum - (domain.maximum - domain.minimum) * i / domain.intervals), style = MaterialTheme.typography.labelSmall, color = muted) }
                    }
                    Box(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                        Canvas(Modifier.fillMaxWidth().height(chartHeight).testTag(tag).semantics { contentDescription = "$label, ${dates.size} точек. Нажмите для просмотра значения." }
                            .pointerInput(dates, shown, style) {
                                detectTapGestures { tap ->
                                    if (style == "pie") {
                                        val angle = (atan2(tap.y - size.height / 2, tap.x - size.width / 2) * 180 / PI + 450) % 360
                                        var sum = 0.0
                                        seriesIndex = totals.indices.firstOrNull { sum += if (total > 0) totals[it] / total * 360 else 0.0; angle < sum } ?: 0
                                    } else if (style == "radar") {
                                        val angle = (atan2(tap.y - size.height / 2, tap.x - size.width / 2) + PI / 2 + 2 * PI) % (2 * PI)
                                        point = (angle / (2 * PI) * dates.size).roundToInt() % dates.size
                                    } else point = if (style in listOf("columns", "heatmap")) (tap.x / size.width.coerceAtLeast(1) * dates.size).toInt().coerceIn(dates.indices)
                                        else (tap.x / size.width.coerceAtLeast(1) * (dates.size - 1)).roundToInt().coerceIn(dates.indices)
                                }
                            }) {
                            fun x(i: Int) = if (style == "columns") size.width * (i + .5f) / dates.size else if (dates.size == 1) size.width / 2 else size.width * i / (dates.size - 1)
                            fun y(v: Double) = (size.height * (1 - (v - domain.minimum) / (domain.maximum - domain.minimum))).toFloat()
                            if (cartesian) {
                                repeat(domain.intervals + 1) { i -> val at = size.height * i / domain.intervals; drawLine(grid.copy(alpha = .65f), Offset(0f, at), Offset(size.width, at), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))) }
                                drawLine(accent.copy(alpha = .2f), Offset(x(selected), 0f), Offset(x(selected), size.height), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx())))
                            }
                            when (style) {
                                "pie" -> {
                                    val diameter = min(size.width, size.height) - 32.dp.toPx(); val inset = Offset((size.width - diameter) / 2, (size.height - diameter) / 2)
                                    var angle = -90f
                                    if (total <= 0) drawArc(grid, 0f, 360f, false, inset, Size(diameter, diameter), style = Stroke(24.dp.toPx()))
                                    totals.forEachIndexed { i, v -> val sweep = if (total == 0.0) 0f else (v / total * 360).toFloat()
                                        val gap = min(1.5f, sweep / 5)
                                        drawArc(color(i).copy(alpha = if (i == seriesIndex) 1f else .65f), angle + gap / 2, (sweep - gap).coerceAtLeast(0f), false, inset, Size(diameter, diameter), style = Stroke(if (i == seriesIndex) 30.dp.toPx() else 24.dp.toPx(), cap = StrokeCap.Butt)); angle += sweep }
                                }
                                "radar" -> {
                                    val center = Offset(size.width / 2, size.height / 2); val radius = min(size.width, size.height) * .42f
                                    fun radial(i: Int, v: Double) = center + Offset((cos(2 * PI * i / dates.size - PI / 2) * radius * v / domain.maximum).toFloat(), (sin(2 * PI * i / dates.size - PI / 2) * radius * v / domain.maximum).toFloat())
                                    repeat(4) { ring -> val path = Path(); dates.indices.forEach { i -> val p = radial(i, domain.maximum * (ring + 1) / 4); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }; path.close(); drawPath(path, grid, style = Stroke(1.dp.toPx())) }
                                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = muted.toArgb(); textSize = 10.sp.toPx(); textAlign = android.graphics.Paint.Align.CENTER }
                                    val step = ceil(dates.size / 6.0).toInt().coerceAtLeast(1)
                                    dates.indices.filter { it % step == 0 }.forEach { j -> val p = radial(j, domain.maximum * 1.16); drawContext.canvas.nativeCanvas.drawText(plotDate(dates[j]), p.x, p.y + paint.textSize / 3, paint) }
                                    data.forEachIndexed { i, values -> val path = Path(); values.forEachIndexed { j, v -> val p = radial(j, v); if (j == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }; path.close(); drawPath(path, color(i).copy(alpha = .1f)); drawPath(path, color(i), style = Stroke(2.dp.toPx())); values.forEachIndexed { j, v -> drawCircle(color(i), if (j == selected) 5.dp.toPx() else 2.dp.toPx(), radial(j, v)) } }
                                }
                                "heatmap" -> {
                                    val w = size.width / dates.size; val h = size.height / shown.size
                                    data.forEachIndexed { i, values -> values.forEachIndexed { j, v -> drawRoundRect(color(i).copy(alpha = (.06 + .94 * v / domain.maximum).toFloat().coerceIn(0f, 1f)), Offset(j * w + 2, i * h + 2), Size((w - 4).coerceAtLeast(1f), (h - 4).coerceAtLeast(1f)), CornerRadius(4.dp.toPx())) } }
                                    drawRoundRect(accent, Offset(selected * w, 0f), Size(w, size.height), CornerRadius(5.dp.toPx()), style = Stroke(1.5.dp.toPx()))
                                }
                                else -> {
                                    val accumulated = DoubleArray(dates.size)
                                    data.forEachIndexed { i, values ->
                                        val base = accumulated.copyOf()
                                        val points = values.mapIndexed { j, v -> Offset(x(j), y(v + if (style == "stacked") base[j] else 0.0)) }
                                        val path = Path().apply { points.forEachIndexed { j, p -> if (j == 0) moveTo(p.x, p.y) else { val prev = points[j-1]; val middle = (prev.x + p.x) / 2; cubicTo(middle, prev.y, middle, p.y, p.x, p.y) } } }
                                        if (style == "columns") {
                                            val groupWidth = size.width / dates.size; val w = groupWidth * .72f / shown.size
                                            values.forEachIndexed { j, v -> val top = y(v); drawRoundRect(color(i), Offset(x(j) - groupWidth * .36f + i * w, top), Size((w - 2.dp.toPx()).coerceAtLeast(1f), (y(0.0) - top).coerceAtLeast(0f)), CornerRadius(3.dp.toPx())) }
                                        } else {
                                            if (style in listOf("area", "stacked")) {
                                                val fill = Path().apply {
                                                    addPath(path)
                                                    val bottom = dates.indices.reversed().map { j -> Offset(x(j), y(if (style == "stacked") base[j] else domain.minimum)) }
                                                    bottom.forEachIndexed { j, p -> if (j == 0) lineTo(p.x, p.y) else { val previous = bottom[j - 1]; val middle = (previous.x + p.x) / 2; cubicTo(middle, previous.y, middle, p.y, p.x, p.y) } }
                                                    close()
                                                }
                                                drawPath(fill, Brush.verticalGradient(listOf(color(i).copy(alpha = .25f), color(i).copy(alpha = .02f))))
                                            }
                                            drawPath(path, color(i), style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                                            points.forEachIndexed { j, p -> if (dates.size < 16 || j == selected) { drawCircle(color(i), if (j == selected) 4.dp.toPx() else 2.dp.toPx(), p); if (j == selected) drawCircle(Color.White, 1.8.dp.toPx(), p) } }
                                        }
                                        values.indices.forEach { j -> accumulated[j] = values[j] + if (style == "stacked") base[j] else 0.0 }
                                    }
                                }
                            }
                        }
                        if (style == "pie") Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(plotNumber(total), style = MaterialTheme.typography.headlineSmall)
                            Text("за период", style = MaterialTheme.typography.labelSmall, color = muted)
                        }
                    }
                }
                if (style != "pie") Row(Modifier.fillMaxWidth().padding(start = if (cartesian) 46.dp else 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(plotDate(dates.first()), style = MaterialTheme.typography.labelSmall, color = muted)
                    if (dates.size > 2) Text(plotDate(dates[dates.size / 2]), style = MaterialTheme.typography.labelSmall, color = muted)
                    if (dates.size > 1) Text(plotDate(dates.last()), style = MaterialTheme.typography.labelSmall, color = muted)
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            lines.forEachIndexed { i, line ->
                Surface(onClick = { focus = if (focus == line.key) null else line.key }, shape = RoundedCornerShape(10.dp),
                    color = if (focus == line.key) palette[i % palette.size].copy(alpha = .1f) else MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 9.dp).widthIn(max = 290.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(Modifier.size(7.dp).background(palette[i % palette.size], RoundedCornerShape(3.dp)))
                        Text(line.label, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text((if (style == "pie") line.points.values.filterNotNull().sum() else line.points[dates[selected]])?.let(::plotNumber) ?: "—", style = MaterialTheme.typography.labelSmall, color = palette[i % palette.size])
                    }
                }
            }
        }
    }
}
