package com.fittodoay.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** V2 web control: minus / centered value / plus. Holding changes five base steps. */
@Composable fun WorkoutNumberControl(label: String, value: String, change: (String) -> Unit, step: Double,
    modifier: Modifier = Modifier, dark: Boolean = true, enabled: Boolean = true, compact: Boolean = false) {
    val current by rememberUpdatedState(value); val onChange by rememberUpdatedState(change)
    fun adjust(amount: Double) {
        val next = kotlin.math.round(((current.replace(',', '.').toDoubleOrNull() ?: 0.0) + amount).coerceAtLeast(0.0) * 100) / 100
        onChange(if (next % 1.0 == 0.0) next.toLong().toString() else next.toString())
    }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, lineHeight = if (dark) 14.sp else 20.sp, fontSize = if (dark) 10.sp else 14.sp, fontWeight = if (dark) FontWeight.Normal else FontWeight.SemiBold,
            color = if (dark) Color(0xff8895aa) else MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.widthIn(max = if (dark) if (compact) 118.dp else 134.dp else 192.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(if (dark) 4.dp else 8.dp)) {
            WorkoutAdjustButton("−", "Уменьшить ${label.lowercase()}", dark, enabled, step, compact) { adjust(-it) }
            BasicTextField(value.replace('.', ','), change, enabled = enabled, singleLine = true,
                modifier = Modifier.weight(1f).height(if (dark) 42.dp else 48.dp).semantics { contentDescription = label }
                    .then(if (dark) Modifier else Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))),
                textStyle = TextStyle(fontSize = if (dark) if (compact) 20.sp else 25.sp else 16.sp, fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center, color = if (dark) Color(0xfff4f6fa) else MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary), keyboardOptions = KeyboardOptions(keyboardType = if (step == 1.0) KeyboardType.Number else KeyboardType.Decimal),
                decorationBox = { inner -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { inner() } })
            WorkoutAdjustButton("+", "Увеличить ${label.lowercase()}", dark, enabled, step, compact) { adjust(it) }
        }
    }
}
@Composable private fun WorkoutAdjustButton(text: String, description: String, dark: Boolean, enabled: Boolean, step: Double, compact: Boolean, adjust: (Double) -> Unit) {
    val interaction = remember { MutableInteractionSource() }; val pressed by interaction.collectIsPressedAsState()
    val latest by rememberUpdatedState(adjust); var held by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        if (pressed) { held = false; delay(450); held = true; while (true) { latest(step * 5); delay(120) } }
    }
    Surface(onClick = { if (!held) latest(step); held = false }, enabled = enabled, interactionSource = interaction,
        modifier = Modifier.size(if (dark) if (compact) 25.dp else 28.dp else 40.dp).semantics { contentDescription = description },
        shape = if (dark) RoundedCornerShape(9.dp) else CircleShape,
        border = BorderStroke(1.dp, if (dark) Color(0x16ffffff) else MaterialTheme.colorScheme.outline),
        color = if (dark) Color(0x06ffffff) else MaterialTheme.colorScheme.surface) {
        Box(contentAlignment = Alignment.Center) { Text(text, fontSize = 18.sp, fontWeight = FontWeight.Light, color = if (dark) Color(0xffc2cbda) else MaterialTheme.colorScheme.onSurface) }
    }
}
