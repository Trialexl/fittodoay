package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
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
fun plotPointNumber(value: Double): String = String.format(Locale.forLanguageTag("ru"), "%.2f", value).trimEnd('0').trimEnd(',')
/** Canvas coordinates are local to the plot, excluding its Y-axis. */
fun plotDateIndex(style: String, count: Int, x: Float, width: Float): Int {
    if (count <= 1 || width <= 0 || !x.isFinite()) return 0
    val fraction = (x / width).coerceIn(0f, 1f)
    return if (style in listOf("columns", "heatmap")) (fraction * count).toInt().coerceIn(0, count - 1)
    else (fraction * (count - 1)).roundToInt().coerceIn(0, count - 1)
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
    val domain = chartDomain(if (style == "columns") totals else if (style == "stacked") dates.indices.map { d -> data.sumOf { it[d] } } else data.flatten(), zero || style in listOf("area", "stacked", "columns", "radar"))
    var point by remember(dates, style) { mutableIntStateOf(dates.lastIndex) }
    var seriesIndex by remember(lines, style) { mutableIntStateOf(0) }
    val selected = point.coerceIn(dates.indices)
    var tooltip by remember(lines, style, focus) { mutableStateOf<Offset?>(null) }
    val reveal = remember(lines, style, focus) { Animatable(0f) }
    LaunchedEffect(reveal) { reveal.animateTo(1f, tween(700, easing = FastOutSlowInEasing)) }
    fun selectAt(tap: Offset, width: Int, height: Int, dismissSame: Boolean = false) {
        val previousPoint = point; val previousSeries = seriesIndex
        val anchor = Offset((tap.x / width.coerceAtLeast(1)).coerceIn(0f, 1f), (tap.y / height.coerceAtLeast(1)).coerceIn(0f, 1f))
        if (style == "pie") {
            val angle = (atan2(tap.y - height / 2, tap.x - width / 2) * 180 / PI + 450) % 360
            var sum = 0.0
            seriesIndex = totals.indices.firstOrNull { sum += if (total > 0) totals[it] / total * 360 else 0.0; angle < sum } ?: 0
        } else if (style == "columns") {
            seriesIndex = plotDateIndex("columns", shown.size, tap.x, width.toFloat())
        } else if (style == "radar") {
            val angle = (atan2(tap.y - height / 2, tap.x - width / 2) + PI / 2 + 2 * PI) % (2 * PI)
            point = (angle / (2 * PI) * dates.size).roundToInt() % dates.size
        } else {
            point = plotDateIndex(style, dates.size, tap.x, width.toFloat())
            if (style == "heatmap") seriesIndex = (tap.y / height.coerceAtLeast(1) * shown.size).toInt().coerceIn(shown.indices)
        }
        tooltip = if (dismissSame && tooltip != null && previousPoint == point && previousSeries == seriesIndex) null else anchor
    }
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
                Text(if (style == "pie") plotNumber(total) else if (style == "columns") plotNumber(totals[seriesIndex.coerceIn(totals.indices)]) else if (selectedValues.isNotEmpty()) plotNumber(selectedValues.sum()) else "Нет записи", style = MaterialTheme.typography.headlineSmall)
            }
            Surface(shape = RoundedCornerShape(9.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Text(if (style in listOf("pie", "columns")) "За период" else plotDate(dates[selected]), Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelSmall, color = muted)
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
                    BoxWithConstraints(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                        Canvas(Modifier.fillMaxWidth().height(chartHeight).testTag(tag).semantics { contentDescription = "$label, ${dates.size} точек. Нажмите или проведите по горизонтали для просмотра значения." }
                            .pointerInput(dates, shown, style) {
                                detectTapGestures { tap -> selectAt(tap, size.width, size.height, dismissSame = true) }
                            }.pointerInput(dates, shown, style) {
                                detectHorizontalDragGestures(onDragStart = { selectAt(it, size.width, size.height) }) { change, _ ->
                                    change.consume(); selectAt(change.position, size.width, size.height)
                                }
                            }) {
                            val drawProgress = reveal.value
                            fun x(i: Int) = if (style == "columns") size.width * (i + .5f) / shown.size else if (dates.size == 1) size.width / 2 else size.width * i / (dates.size - 1)
                            fun y(v: Double) = (size.height * (1 - (v - domain.minimum) / (domain.maximum - domain.minimum))).toFloat()
                            if (cartesian) {
                                repeat(domain.intervals + 1) { i -> val at = size.height * i / domain.intervals; drawLine(grid.copy(alpha = .65f), Offset(0f, at), Offset(size.width, at), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))) }
                                drawLine(accent.copy(alpha = .2f), Offset(x(if (style == "columns") seriesIndex.coerceIn(shown.indices) else selected), 0f), Offset(x(if (style == "columns") seriesIndex.coerceIn(shown.indices) else selected), size.height), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx())))
                            }
                            clipRect(right = if (cartesian && style != "columns") size.width * drawProgress else size.width) {
                            when (style) {
                                "pie" -> {
                                    val diameter = min(size.width, size.height) - 32.dp.toPx(); val inset = Offset((size.width - diameter) / 2, (size.height - diameter) / 2)
                                    var angle = -90f
                                    if (total <= 0) drawArc(grid, 0f, 360f, false, inset, Size(diameter, diameter), style = Stroke(24.dp.toPx()))
                                    totals.forEachIndexed { i, v -> val sweep = if (total == 0.0) 0f else (v / total * 360).toFloat() * drawProgress
                                        val gap = min(1.5f, sweep / 5)
                                        drawArc(color(i).copy(alpha = if (i == seriesIndex) 1f else .65f), angle + gap / 2, (sweep - gap).coerceAtLeast(0f), false, inset, Size(diameter, diameter), style = Stroke(if (i == seriesIndex) 30.dp.toPx() else 24.dp.toPx(), cap = StrokeCap.Butt)); angle += sweep }
                                }
                                "columns" -> {
                                    val width = size.width / shown.size * .55f
                                    totals.forEachIndexed { i, value ->
                                        val top = y(value * drawProgress)
                                        drawRoundRect(color(i), Offset(x(i) - width / 2, top), Size(width, (y(0.0) - top).coerceAtLeast(0f)), CornerRadius(5.dp.toPx()))
                                    }
                                }
                                "radar" -> {
                                    val center = Offset(size.width / 2, size.height / 2); val radius = min(size.width, size.height) * .42f * drawProgress
                                    fun radial(i: Int, v: Double) = center + Offset((cos(2 * PI * i / dates.size - PI / 2) * radius * v / domain.maximum).toFloat(), (sin(2 * PI * i / dates.size - PI / 2) * radius * v / domain.maximum).toFloat())
                                    repeat(4) { ring -> val path = Path(); dates.indices.forEach { i -> val p = radial(i, domain.maximum * (ring + 1) / 4); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }; path.close(); drawPath(path, grid, style = Stroke(1.dp.toPx())) }
                                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = muted.toArgb(); textSize = 10.sp.toPx(); textAlign = android.graphics.Paint.Align.CENTER }
                                    val step = ceil(dates.size / 6.0).toInt().coerceAtLeast(1)
                                    dates.indices.filter { it % step == 0 }.forEach { j -> val p = radial(j, domain.maximum * 1.16); drawContext.canvas.nativeCanvas.drawText(plotDate(dates[j]), p.x, p.y + paint.textSize / 3, paint) }
                                    data.forEachIndexed { i, values -> val path = Path(); values.forEachIndexed { j, v -> val p = radial(j, v); if (j == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }; path.close(); drawPath(path, color(i).copy(alpha = .1f)); drawPath(path, color(i), style = Stroke(2.dp.toPx())); values.forEachIndexed { j, v -> drawCircle(color(i), if (j == selected) 5.dp.toPx() else 2.dp.toPx(), radial(j, v)) } }
                                }
                                "heatmap" -> {
                                    val w = size.width / dates.size; val h = size.height / shown.size
                                    data.forEachIndexed { i, values -> values.forEachIndexed { j, v -> drawRoundRect(color(i).copy(alpha = ((.06 + .94 * v / domain.maximum) * drawProgress).toFloat().coerceIn(0f, 1f)), Offset(j * w + 2, i * h + 2), Size((w - 4).coerceAtLeast(1f), (h - 4).coerceAtLeast(1f)), CornerRadius(4.dp.toPx())) } }
                                    drawRoundRect(accent, Offset(selected * w, 0f), Size(w, size.height), CornerRadius(5.dp.toPx()), style = Stroke(1.5.dp.toPx()))
                                }
                                else -> {
                                    val accumulated = DoubleArray(dates.size)
                                    data.forEachIndexed { i, values ->
                                        val base = accumulated.copyOf()
                                        val points = values.mapIndexed { j, v -> Offset(x(j), y(v + if (style == "stacked") base[j] else 0.0)) }
                                        val path = Path().apply { points.forEachIndexed { j, p -> if (j == 0) moveTo(p.x, p.y) else { val prev = points[j-1]; val middle = (prev.x + p.x) / 2; cubicTo(middle, prev.y, middle, p.y, p.x, p.y) } } }
                                        run {
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
                        }
                        tooltip?.let { anchor ->
                            val density = androidx.compose.ui.platform.LocalDensity.current
                            val tooltipWidth = minOf(220.dp, maxWidth)
                            val left = ((maxWidth - tooltipWidth) * anchor.x).coerceAtLeast(0.dp)
                            val top = if (anchor.y > .5f) 8.dp else (chartHeight - 100.dp).coerceAtLeast(8.dp)
                            val entries = if (style in listOf("pie", "columns", "heatmap")) listOf(seriesIndex.coerceIn(shown.indices)) else shown.indices.toList()
                            // A Material Surface consumes pointer input even without an onClick.
                            // Draw this overlay without input nodes so scrubbing continues underneath.
                            Box(Modifier.offset { IntOffset(with(density) { left.roundToPx() }, with(density) { top.roundToPx() }) }
                                .width(tooltipWidth).shadow(6.dp, RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp))
                                .border(1.dp, grid, RoundedCornerShape(10.dp)).testTag("$tag-tooltip").semantics { liveRegion = LiveRegionMode.Polite }) {
                                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(if (style in listOf("pie", "columns")) "За выбранный период" else dates[selected], style = MaterialTheme.typography.labelSmall, color = muted)
                                    entries.take(4).forEach { i ->
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Box(Modifier.size(6.dp).background(color(i), RoundedCornerShape(3.dp)))
                                            Text(shown[i].label, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                            Text((if (style in listOf("pie", "columns")) totals[i] else shown[i].points[dates[selected]])?.let(::plotPointNumber) ?: "Нет записи", style = MaterialTheme.typography.labelMedium)
                                        }
                                    }
                                    if (entries.size > 4) Text("Ещё ${entries.size - 4} · выберите серию в легенде", style = MaterialTheme.typography.labelSmall, color = muted)
                                }
                            }
                        }
                        if (style == "pie" && tooltip == null) Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(plotNumber(total), style = MaterialTheme.typography.headlineSmall)
                            Text("за период", style = MaterialTheme.typography.labelSmall, color = muted)
                        }
                    }
                }
                if (style == "columns") Row(Modifier.fillMaxWidth().padding(start = 46.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    shown.forEach { line -> Text(line.label, Modifier.weight(1f).padding(horizontal = 3.dp), style = MaterialTheme.typography.labelSmall, color = muted,
                        maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                }
                else if (style != "pie") Row(Modifier.fillMaxWidth().padding(start = if (cartesian) 46.dp else 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
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
                        Text((if (style in listOf("pie", "columns")) line.points.values.filterNotNull().sum() else line.points[dates[selected]])?.let(::plotNumber) ?: "—", style = MaterialTheme.typography.labelSmall, color = palette[i % palette.size])
                    }
                }
            }
        }
    }
}
