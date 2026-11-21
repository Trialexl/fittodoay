package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** Shared V2 detail surface: fixed header, independently scrolling content. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DetailSurface(title: String, subtitle: String? = null, tag: String, dismiss: () -> Unit, compact: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val window = androidx.compose.ui.platform.LocalWindowInfo.current.containerSize
    val density = androidx.compose.ui.platform.LocalDensity.current
    val windowWidth = with(density) { window.width.toDp() }
    val windowHeight = with(density) { window.height.toDp() }
    val body: @Composable ColumnScope.() -> Unit = {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(title, style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                subtitle?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            FilledTonalIconButton(onClick = dismiss, modifier = Modifier.size(36.dp), shape = RoundedCornerShape(12.dp),
                colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Icon(Icons.Outlined.Close, "Закрыть", Modifier.size(18.dp))
            }
        }
        content()
    }
    if (windowWidth < 600.dp) {
        ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            contentWindowInsets = { WindowInsets.safeDrawing }) {
            Column(Modifier.fillMaxWidth().then(if (compact) Modifier.height(windowHeight * .94f) else Modifier.heightIn(max = windowHeight * .88f)).imePadding().testTag(tag).padding(start = if (compact) 14.dp else 20.dp, end = if (compact) 14.dp else 20.dp, bottom = if (compact) 10.dp else 20.dp),
                verticalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 18.dp), content = body)
        }
    } else Dialog(onDismissRequest = dismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        BoxWithConstraints(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(20.dp), contentAlignment = Alignment.Center) {
            Surface(Modifier.widthIn(max = 760.dp).fillMaxWidth().heightIn(max = maxHeight * .94f), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.then(if (compact) Modifier.height(maxHeight * .88f) else Modifier).testTag(tag).padding(if (compact) 18.dp else 24.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 18.dp), content = body)
            }
        }
    }
}

@Composable fun CompactSelector(label: String, value: String, options: List<Pair<String, String>>, changed: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Surface(onClick = { open = true }, shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(options.firstOrNull { it.first == value }?.second ?: label, style = MaterialTheme.typography.labelMedium)
                Icon(Icons.Outlined.ExpandMore, label, Modifier.size(16.dp))
            }
        }
        DropdownMenu(open, { open = false }) {
            options.forEach { (id, title) -> DropdownMenuItem(text = { Text(title) }, onClick = { open = false; changed(id) },
                trailingIcon = { if (id == value) Icon(Icons.Outlined.Check, null, Modifier.size(16.dp)) }) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DetailTabs(value: String, options: List<Pair<String, String>>, changed: (String) -> Unit) {
    SecondaryTabRow(selectedTabIndex = options.indexOfFirst { it.first == value }.coerceAtLeast(0), containerColor = MaterialTheme.colorScheme.surface) {
        options.forEach { (id, title) -> Tab(selected = value == id, onClick = { changed(id) }, text = { Text(title, style = MaterialTheme.typography.labelMedium) }) }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable fun SegmentedOptions(value: String, options: List<Pair<String, String>>, changed: (String) -> Unit) {
    if (options.size <= 3) SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, (id, title) ->
            SegmentedButton(selected = value == id, onClick = { changed(id) }, shape = SegmentedButtonDefaults.itemShape(index, options.size), icon = {},
                label = { Text(title, style = MaterialTheme.typography.labelMedium, maxLines = 2) })
        }
    } else FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        options.forEach { (id, title) -> FilterChip(selected = value == id, onClick = { changed(id) }, label = { Text(title, style = MaterialTheme.typography.labelMedium) }) }
    }
}

@Composable fun BodyWeightCard(model: AppModel, value: String, changed: (String) -> Unit) {
    FitCard(Modifier.testTag("body-weight-panel"), padding = 16.dp) {
        BoxWithConstraints {
            val narrow = maxWidth < 280.dp || androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.2f
            val label: @Composable (Modifier) -> Unit = { modifier ->
                Row(modifier.clickable(enabled = !model.busy) { model.focusBodyWeight = true; model.navigate(Screen.Analytics) }.heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.BarChart, "Открыть статистику веса", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("Вес перед тренировкой", style = MaterialTheme.typography.labelMedium)
                }
            }
            val input: @Composable () -> Unit = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value, changed, Modifier.width(if (narrow) 140.dp else 112.dp).semantics { contentDescription = "Вес, кг" },
                        singleLine = true, label = { Text("Вес", style = MaterialTheme.typography.labelSmall) }, suffix = { Text("кг", style = MaterialTheme.typography.labelSmall) },
                        textStyle = MaterialTheme.typography.labelLarge, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), shape = RoundedCornerShape(12.dp))
                    FilledTonalIconButton(onClick = { model.weighIn(value) }, enabled = value.replace(',', '.').toDoubleOrNull()?.let { it > 0 && it.isFinite() } == true && !model.busy,
                        modifier = Modifier.size(44.dp), shape = RoundedCornerShape(12.dp)) { Icon(Icons.Outlined.Check, "Сохранить вес", Modifier.size(18.dp)) }
                }
            }
            if (narrow) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { label(Modifier.fillMaxWidth()); input() }
            else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { label(Modifier.weight(1f)); input() }
        }
    }
}
