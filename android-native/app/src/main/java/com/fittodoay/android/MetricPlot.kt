package com.fittodoay.android

import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.patrykandpatrick.vico.compose.cartesian.*
import com.patrykandpatrick.vico.compose.cartesian.axis.*
import com.patrykandpatrick.vico.compose.cartesian.layer.*
import com.patrykandpatrick.vico.compose.cartesian.marker.rememberDefaultCartesianMarker
import com.patrykandpatrick.vico.compose.common.component.*
import com.patrykandpatrick.vico.compose.common.fill
import com.patrykandpatrick.vico.compose.common.insets
import com.patrykandpatrick.vico.core.cartesian.axis.*
import com.patrykandpatrick.vico.core.cartesian.data.*
import com.patrykandpatrick.vico.core.cartesian.layer.*
import com.patrykandpatrick.vico.core.cartesian.marker.*
import com.patrykandpatrick.vico.core.common.component.LineComponent
import com.patrykandpatrick.vico.core.common.data.ExtraStore
import com.patrykandpatrick.vico.core.common.shape.CorneredShape
import io.github.koalaplot.core.pie.*
import io.github.koalaplot.core.polar.*
import io.github.koalaplot.core.style.AreaStyle
import io.github.koalaplot.core.style.LineStyle
import io.github.koalaplot.core.util.ExperimentalKoalaPlotApi
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
fun plotDate(date: String): String = runCatching { java.time.LocalDate.parse(date).format(java.time.format.DateTimeFormatter.ofPattern("dd.MM")) }.getOrDefault(date)

/** Charts share data, colors and selection details; libraries own drawing and hit testing. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun MetricPlot(lines: List<TrendLine>, style: String, tag: String, label: String = "Нагрузка", zero: Boolean = true) {
    var focus by remember(lines) { mutableStateOf<String?>(null) }
    val shown = lines.filter { focus == null || it.key == focus }
    val dates = shown.flatMap { it.points.keys }.distinct().sorted()
    if (dates.isEmpty() || shown.none { it.points.values.any { v -> v != null && v.isFinite() } }) {
        Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Данные ещё появятся", style = MaterialTheme.typography.titleSmall)
            Text("Выполните подход или выберите другой период", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val values = shown.map { line -> interpolateTrend(dates.map { line.points[it]?.takeIf(Double::isFinite) }) }
    val totals = shown.map { it.points.values.filterNotNull().filter(Double::isFinite).sum() }
    val palette = listOf(MaterialTheme.colorScheme.primary, Color(0xff16a6a0), Color(0xffee9d36), Color(0xffe46a8b), Color(0xff6489dd), Color(0xffa18b6e))
    val colors = shown.map { palette[lines.indexOf(it) % palette.size] }
    var selected by remember(shown, style) { mutableStateOf<Int?>(null) }
    var selectedSeries by remember(shown, style) { mutableIntStateOf(0) }
    val period = style in listOf("columns", "pie")
    val selectedDate = selected?.coerceIn(dates.indices)
    val description = if (selectedDate == null) "Нажмите на график, чтобы посмотреть значения" else if (period) "За выбранный период" else dates[selectedDate]
    Column(Modifier.testTag("$tag-panel"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        key(shown, style) {
            val modifier = Modifier.fillMaxWidth().height(if (style == "heatmap") (shown.size * 36 + 24).coerceIn(96, 320).dp else 240.dp).testTag(tag).semantics {
                contentDescription = "$label, ${dates.size} точек. Нажмите для просмотра значения."
                stateDescription = if (selectedDate == null) description else description + ", " + shown.mapIndexed { i, line -> "${line.label}: ${(if (period) totals[i] else line.points[dates[selectedDate]])?.let(::plotPointNumber) ?: "Нет записи"}" }.joinToString(", ")
            }
            when (style) {
                "pie" -> DonutPlot(totals, colors, modifier) { selectedSeries = it; selected = 0 }
                "radar" -> RadarPlot(dates, values, colors, modifier) { d, s -> selected = d; selectedSeries = s }
                "heatmap" -> HeatmapPlot(shown, dates, colors, modifier) { d, s -> selected = d; selectedSeries = s }
                else -> CartesianPlot(shown, dates, values, totals, colors, style, zero, modifier) { x ->
                    selected = if (period) 0 else x.coerceIn(dates.indices)
                    if (period) selectedSeries = x.coerceIn(shown.indices)
                }
            }
        }
        // A stable detail area keeps text readable and accessible without obscuring the plot.
        Column(Modifier.fillMaxWidth().heightIn(min = 58.dp).then(if (selected != null) Modifier.testTag("$tag-tooltip") else Modifier)
            .semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(description, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (selectedDate != null) {
                val entries = if (style in listOf("columns", "pie", "heatmap", "radar")) listOf(selectedSeries) else shown.indices.toList()
                entries.forEach { i ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(6.dp).background(colors[i], CircleShape))
                        Text(shown[i].label, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text((if (period) totals[i] else shown[i].points[dates[selectedDate]])?.let(::plotPointNumber) ?: "Нет записи", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        if (lines.size > 1) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            lines.forEachIndexed { i, line ->
                FilterChip(selected = focus == line.key, onClick = { focus = if (focus == line.key) null else line.key },
                    label = { Text(line.label, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 230.dp), style = MaterialTheme.typography.labelSmall) },
                    leadingIcon = { Box(Modifier.size(7.dp).background(palette[i % palette.size], CircleShape)) })
            }
        }
    }
}

@Composable private fun CartesianPlot(lines: List<TrendLine>, dates: List<String>, values: List<List<Double>>, totals: List<Double>, colors: List<Color>, style: String, zero: Boolean, modifier: Modifier, select: (Int) -> Unit) {
    val columns = style == "columns"
    val stacked = style == "stacked"
    val plotted = if (stacked) stackedTrendValues(values) else values
    val chartColors = if (stacked) colors.reversed() else colors
    val domain = chartDomain(if (columns) totals else plotted.flatten(), zero || style != "line")
    val isolated = if (columns) totals.size == 1 else dates.size == 1
    val range = remember(domain, isolated) { CartesianLayerRangeProvider.fixed(minX = if (isolated) -1.0 else null, maxX = if (isolated) 1.0 else null, minY = domain.minimum, maxY = domain.maximum) }
    val producer = remember { CartesianChartModelProducer() }
    LaunchedEffect(plotted, totals, style) {
        producer.runTransaction {
            if (columns) columnSeries { series(totals) }
            else lineSeries { plotted.forEach { series(it) } }
        }
    }
    val label = rememberTextComponent(color = MaterialTheme.colorScheme.onSurfaceVariant, textSize = 10.sp)
    val axis = rememberAxisGuidelineComponent(fill = fill(MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f)))
    val surface = MaterialTheme.colorScheme.surface
    val columnComponents = colors.map { rememberLineComponent(fill(it), thickness = 24.dp, shape = CorneredShape.rounded(topLeftDp = 6f, topRightDp = 6f)) }
    val columnProvider = remember(columnComponents) { object : ColumnCartesianLayer.ColumnProvider {
        override fun getColumn(entry: ColumnCartesianLayerModel.Entry, seriesIndex: Int, extraStore: ExtraStore): LineComponent = columnComponents[entry.x.roundToInt().coerceIn(columnComponents.indices)]
        override fun getWidestSeriesColumn(seriesIndex: Int, extraStore: ExtraStore): LineComponent = columnComponents.first()
    } }
    val layer = if (columns) rememberColumnCartesianLayer(columnProvider = columnProvider, rangeProvider = range,
    ) else rememberLineCartesianLayer(
        lineProvider = LineCartesianLayer.LineProvider.series(chartColors.map { color ->
            LineCartesianLayer.rememberLine(fill = LineCartesianLayer.LineFill.single(fill(color)),
                stroke = LineCartesianLayer.LineStroke.continuous(thickness = 2.5.dp),
                pointProvider = LineCartesianLayer.PointProvider.single(LineCartesianLayer.point(rememberShapeComponent(fill(color), CorneredShape.Pill), if (dates.size < 16) 5.dp else 3.dp)),
                areaFill = if (style in listOf("area", "stacked")) LineCartesianLayer.AreaFill.single(fill(if (stacked) color.copy(alpha = .25f).compositeOver(surface) else color.copy(alpha = .13f))) else null,
                pointConnector = LineCartesianLayer.PointConnector.cubic())
        }), rangeProvider = range,
    )
    val currentSelect by rememberUpdatedState(select)
    var pinned by remember { mutableStateOf<Double?>(null) }
    // Use Vico's rendered targets, including its axis insets and zoom, rather than mapping pixels to dates.
    fun selectTarget(x: Float) {
        val target = layer.markerTargets.values.flatten().minByOrNull { abs(it.canvasX - x) } ?: return
        pinned = target.x
        currentSelect(target.x.roundToInt())
    }
    val marker = rememberDefaultCartesianMarker(
        labelPosition = DefaultCartesianMarker.LabelPosition.AroundPoint,
        label = rememberTextComponent(color = MaterialTheme.colorScheme.onSurface, textSize = 11.sp, lineCount = 6, padding = insets(8.dp, 5.dp),
            background = rememberShapeComponent(fill(MaterialTheme.colorScheme.surfaceContainerHigh), CorneredShape.rounded(8f))),
        valueFormatter = DefaultCartesianMarker.ValueFormatter { _, targets ->
            val x = targets.first().x.roundToInt()
            if (columns) lines.getOrNull(x)?.let { "${it.label}: ${plotPointNumber(totals[x])}" }.orEmpty()
            else dates.getOrNull(x)?.let { date -> date + "\n" + lines.take(4).joinToString("\n") { line -> "${line.label}: ${line.points[date]?.let(::plotPointNumber) ?: "Нет записи"}" } }.orEmpty()
        }, guideline = rememberAxisGuidelineComponent(fill = fill(MaterialTheme.colorScheme.primary)),
    )
    CartesianChartHost(
        chart = rememberCartesianChart(layer,
            startAxis = VerticalAxis.rememberStart(label = label, line = null, tick = null, guideline = axis,
                itemPlacer = VerticalAxis.ItemPlacer.step(step = { (domain.maximum - domain.minimum) / domain.intervals }), valueFormatter = CartesianValueFormatter { _, value, _ -> plotNumber(value) }),
            bottomAxis = HorizontalAxis.rememberBottom(label = label, line = null, tick = null, guideline = null,
                itemPlacer = HorizontalAxis.ItemPlacer.aligned(spacing = { if (isolated) 2 else if (columns) ceil(lines.size / 4.0).toInt().coerceAtLeast(1) else ceil((dates.size - 1) / 3.0).toInt().coerceAtLeast(1) }, offset = { if (isolated) 1 else 0 }),
                valueFormatter = CartesianValueFormatter { _, x, _ -> if (columns) lines[x.roundToInt().coerceIn(lines.indices)].label.let { if (it.length > 13) it.take(12) + "…" else it } else plotDate(dates[x.roundToInt().coerceIn(dates.indices)]) }),
            persistentMarkers = { pinned?.let { marker at it } },
            layerPadding = { cartesianLayerPadding(unscalableStart = 12.dp, unscalableEnd = 12.dp) }),
        modelProducer = producer, modifier = modifier
            .pointerInput(layer) { detectTapGestures { selectTarget(it.x) } }
            .pointerInput(layer) { detectHorizontalDragGestures(onDragStart = { selectTarget(it.x) }) { change, _ -> change.consume(); selectTarget(change.position.x) } },
        scrollState = rememberVicoScrollState(scrollEnabled = false),
        animationSpec = tween(700), animateIn = true,
        placeholder = { Box(Modifier.fillMaxSize().testTag("metric-chart-loading"), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) } },
    )
}

@OptIn(ExperimentalKoalaPlotApi::class)
@Composable private fun DonutPlot(totals: List<Double>, colors: List<Color>, modifier: Modifier, select: (Int) -> Unit) {
    if (totals.sum() <= 0) { Box(modifier, contentAlignment = Alignment.Center) { Text("Нет нагрузки за период", style = MaterialTheme.typography.bodySmall) }; return }
    PieChart(values = totals.map { it.coerceAtLeast(0.0).toFloat() }, modifier = modifier, holeSize = .76f, pieAnimationSpec = tween(700), labelConnector = {},
        slice = { i -> DefaultSlice(colors[i], modifier = Modifier.testTag("pie-slice-$i"), clickable = true, antiAlias = true, gap = 1f, onClick = { select(i) }) },
        holeContent = { Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(plotNumber(totals.sum()), style = MaterialTheme.typography.headlineSmall)
            Text("за период", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } })
}

@OptIn(ExperimentalKoalaPlotApi::class)
@Composable private fun RadarPlot(dates: List<String>, values: List<List<Double>>, colors: List<Color>, modifier: Modifier, select: (Int, Int) -> Unit) {
    val domain = chartDomain(values.flatten(), true)
    val grid = MaterialTheme.colorScheme.outlineVariant
    val centers = remember(dates, values) { mutableMapOf<Pair<Int, Int>, Offset>() }
    var origin by remember { mutableStateOf(Offset.Zero) }
    val currentSelect by rememberUpdatedState(select)
    val interactions = modifier.onGloballyPositioned { origin = it.positionInRoot() }.pointerInput(dates, values) {
        detectTapGestures { tap ->
            centers.minByOrNull { (_, center) -> (center - (tap + origin)).getDistanceSquared() }?.key?.let { (d, s) -> currentSelect(d, s) }
        }
    }
    PolarGraph(radialAxisModel = rememberFloatRadialAxisModel((0..4).map { (domain.maximum * it / 4).toFloat() }),
        angularAxisModel = rememberCategoryAngularAxisModel(dates), modifier = interactions,
        radialAxisLabels = { Text(plotNumber(it.toDouble()), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        angularAxisLabels = { d -> if (dates.indexOf(d) % ceil(dates.size / 6.0).toInt().coerceAtLeast(1) == 0) Text(plotDate(d), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        polarGraphProperties = PolarGraphDefaults.PolarGraphPropertyDefaults().copy(radialGridType = RadialGridType.LINES, radialAxisGridLineStyle = LineStyle(SolidColor(grid), strokeWidth = 1.dp), angularAxisGridLineStyle = LineStyle(SolidColor(grid.copy(alpha = .5f)), strokeWidth = 1.dp))) {
        values.forEachIndexed { s, series ->
            PolarPlotSeries(data = dates.indices.map { PolarPoint(series[it].toFloat(), dates[it]) },
                lineStyle = LineStyle(SolidColor(colors[s]), strokeWidth = 2.dp), areaStyle = AreaStyle(SolidColor(colors[s]), alpha = .1f), animationSpec = tween(700),
                symbols = { point ->
                    val d = dates.indexOf(point.theta)
                    Box(Modifier.size(5.dp).testTag("radar-point-$d-$s").onGloballyPositioned { centers[d to s] = it.boundsInRoot().center }
                        .background(colors[s], CircleShape).semantics {
                            contentDescription = "${point.theta}, ${plotPointNumber(point.r.toDouble())}"
                            onClick { select(d, s); true }
                        })
                })
        }
    }
}

/** A scrollable matrix uses Foundation's lazy grid and Material cells, including real missing records. */
@Composable private fun HeatmapPlot(lines: List<TrendLine>, dates: List<String>, colors: List<Color>, modifier: Modifier, select: (Int, Int) -> Unit) {
    val max = lines.flatMap { it.points.values }.filterNotNull().maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val alpha by animateFloatAsState(if (appeared) 1f else 0f, tween(700), label = "heatmap appearance")
    LazyHorizontalGrid(rows = GridCells.Fixed(lines.size), modifier = modifier.alpha(alpha),
        horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
        items(dates.size * lines.size) { index ->
            val d = index / lines.size; val s = index % lines.size; val value = lines[s].points[dates[d]]
            Surface(onClick = { select(d, s) }, modifier = Modifier.width(36.dp).fillMaxHeight().testTag("heatmap-cell-$d-$s").semantics { contentDescription = "${dates[d]}, ${lines[s].label}, ${value?.let(::plotPointNumber) ?: "Нет записи"}" },
                color = if (value == null) MaterialTheme.colorScheme.surfaceContainerHigh else colors[s].copy(alpha = (.12 + .88 * value / max).toFloat().coerceIn(0f, 1f)).compositeOver(MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(6.dp)) {
                Box(contentAlignment = Alignment.Center) { Text(if (value == null) "—" else plotDate(dates[d]).substringBefore('.'), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface) }
            }
        }
    }
}
