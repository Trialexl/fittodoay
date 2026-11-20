package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog

@Composable fun CompactInput(label: String, value: String, change: (String) -> Unit, placeholder: String = "",
    visualTransformation: VisualTransformation = VisualTransformation.None, keyboard: KeyboardType = KeyboardType.Decimal) {
    OutlinedTextField(value = value, onValueChange = change, modifier = Modifier.fillMaxWidth(), singleLine = true,
        label = { Text(label) }, placeholder = { Text(placeholder) }, shape = RoundedCornerShape(12.dp),
        visualTransformation = visualTransformation, keyboardOptions = KeyboardOptions(keyboardType = keyboard))
}

@Composable fun AppearanceControls(model: AppModel) {
    var customAccent by remember(model.preferences.text("accent_color")) { mutableStateOf(model.preferences.text("accent_color", "#a855f7")) }
    Text("Группы мышц на тренировке", style = MaterialTheme.typography.titleMedium)
    listOf(Triple("chips", "Плашки в сводке", "Количество упражнений на каждую группу в верхней карточке."),
        Triple("bars", "Отдельный виджет", "Общее и выполненное количество упражнений со шкалой прогресса."),
        Triple("row", "Раскрываемая строка", "Краткая строка с основными группами. Полный список раскрывается нажатием.")).forEach { (id, title, description) ->
        val selected = model.preferences.text("muscle_summary_view", "chips") == id
        Surface(onClick = { model.preferences(obj("muscle_summary_view" to id)) }, enabled = !model.busy,
            shape = RoundedCornerShape(14.dp), border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
            color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .025f) else MaterialTheme.colorScheme.surface) {
            Row(Modifier.fillMaxWidth().padding(14.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(title, style = MaterialTheme.typography.titleSmall)
                    Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                RadioButton(selected, null, Modifier.size(24.dp))
            }
        }
    }
    Choices("Тема", model.preferences.text("theme", "light"), listOf("light" to "Светлая", "dark" to "Тёмная")) { model.preferences(obj("theme" to it)) }
    AccentPicker(model.preferences.text("accent_color", "#a855f7")) { model.preferences(obj("accent_color" to it)) }
    Field("Свой цвет #RRGGBB", customAccent, { customAccent = it })
    TextButton(onClick = { model.preferences(obj("accent_color" to customAccent)) }, enabled = !model.busy && customAccent.matches(Regex("#[0-9a-fA-F]{6}"))) { Text("Применить цвет") }
}

@Composable fun AppearanceDialog(model: AppModel, dismiss: () -> Unit) {
    Dialog(onDismissRequest = dismiss) {
        Surface(shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.heightIn(max = 700.dp).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Оформление", style = MaterialTheme.typography.titleLarge)
                Text("Выберите тему и акцентный цвет.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    AppearanceControls(model)
                }
                TextButton(onClick = dismiss, modifier = Modifier.fillMaxWidth()) { Text("Готово") }
            }
        }
    }
}
