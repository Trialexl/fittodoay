package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
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
            Column(Modifier.fillMaxWidth().then(if (compact) Modifier.height(windowHeight * .88f) else Modifier.heightIn(max = windowHeight * .88f)).imePadding().testTag(tag).padding(start = if (compact) 14.dp else 20.dp, end = if (compact) 14.dp else 20.dp, bottom = if (compact) 10.dp else 20.dp),
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

@Composable fun DetailTabs(value: String, options: List<Pair<String, String>>, changed: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (id, title) ->
            Surface(onClick = { changed(id) }, modifier = Modifier.weight(1f).semantics { selected = value == id; role = Role.Tab }, shape = RoundedCornerShape(9.dp),
                color = if (value == id) MaterialTheme.colorScheme.surface else androidx.compose.ui.graphics.Color.Transparent) {
                Text(title, Modifier.padding(horizontal = 8.dp, vertical = 11.dp), style = MaterialTheme.typography.labelMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    color = if (value == id) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun SegmentedOptions(value: String, options: List<Pair<String, String>>, changed: (String) -> Unit) {
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (id, title) ->
            val selected = value == id
            Surface(onClick = { changed(id) }, modifier = Modifier.semantics { this.selected = selected; role = Role.Tab }, shape = RoundedCornerShape(9.dp),
                color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant) {
                Text(title, Modifier.padding(horizontal = 13.dp, vertical = 9.dp), style = MaterialTheme.typography.labelMedium,
                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
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
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.width(if (narrow) 140.dp else 100.dp)) {
                        Row(Modifier.padding(horizontal = 12.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            BasicTextField(value, changed, Modifier.weight(1f).semantics { contentDescription = "Вес, кг" }, singleLine = true,
                                textStyle = MaterialTheme.typography.labelLarge.copy(color = MaterialTheme.colorScheme.onSurface), cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), decorationBox = { field ->
                                    if (value.isEmpty()) Text("Вес, кг", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                                    field()
                                })
                        }
                    }
                    FilledTonalIconButton(onClick = { model.weighIn(value) }, enabled = value.replace(',', '.').toDoubleOrNull()?.let { it > 0 && it.isFinite() } == true && !model.busy,
                        modifier = Modifier.size(44.dp), shape = RoundedCornerShape(12.dp)) { Icon(Icons.Outlined.Check, "Сохранить вес", Modifier.size(18.dp)) }
                }
            }
            if (narrow) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { label(Modifier.fillMaxWidth()); input() }
            else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { label(Modifier.weight(1f)); input() }
        }
    }
}
