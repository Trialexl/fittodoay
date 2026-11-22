package com.fittodoay.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check

val FitShapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp), extraLarge = RoundedCornerShape(24.dp))

val FitTypography = Typography(
    displayLarge = TextStyle(fontSize = 56.sp, lineHeight = 64.sp, fontWeight = FontWeight.Bold),
    headlineLarge = TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-.7).sp),
    headlineMedium = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-.5).sp),
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium)
)

fun fitColors(dark: Boolean, accent: Color, modern: Boolean): ColorScheme = if (dark) darkColorScheme(
    primary = accent, onPrimary = if (accent.luminance() > .179f) Color(0xff111827) else Color.White, primaryContainer = accent.copy(alpha = .18f), onPrimaryContainer = accent,
    background = Color(0xff12151d), surface = Color(0xff1d222d), onBackground = Color(0xfff1f5f9), onSurface = Color(0xfff1f5f9),
    onSurfaceVariant = Color(0xffa4adbd), surfaceVariant = Color(0xff282e3a), outline = Color(0xff3a4353), outlineVariant = Color(0xff303744),
    surfaceContainer = Color(0xff1d222d), surfaceContainerLow = Color(0xff1d222d), surfaceContainerHigh = Color(0xff252b36)
) else lightColorScheme(
    primary = accent, onPrimary = if (accent.luminance() > .179f) Color(0xff111827) else Color.White, primaryContainer = accent.copy(alpha = .09f), onPrimaryContainer = accent,
    background = if (modern) Color(0xfff5f6f8) else Color(0xfff1f5f9), surface = Color.White,
    onBackground = Color(0xff111827), onSurface = Color(0xff111827), onSurfaceVariant = Color(0xff64748b),
    surfaceVariant = Color(0xfff8fafc), outline = Color(0xffd7dde5), outlineVariant = Color(0xffe5e9ef),
    surfaceContainer = Color.White, surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White,
    surfaceContainerHigh = Color(0xfff8fafc), surfaceContainerHighest = Color(0xffeef2f6)
)

@Composable fun ScreenHeading(eyebrow: String, title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        if (eyebrow.isNotBlank()) Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, letterSpacing = 1.6.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.headlineLarge)
        subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable fun FitCard(modifier: Modifier = Modifier, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 0.dp) {
        Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable fun AccentPicker(selected: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("АКЦЕНТНЫЙ ЦВЕТ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("#a855f7" to "Фиолетовый", "#0ea5e9" to "Голубой", "#22c55e" to "Зелёный", "#f59e0b" to "Янтарный", "#ef4444" to "Красный").forEach { (hex, name) ->
                val color = Color(android.graphics.Color.parseColor(hex))
                IconButton(onClick = { onChange(hex) }, modifier = Modifier.size(48.dp)) {
                    Surface(Modifier.size(34.dp), shape = CircleShape, color = color) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Check, name, tint = if (selected.equals(hex, true)) Color.White else Color.Transparent, modifier = Modifier.size(22.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable fun DesignPicker(selected: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Версия интерфейса", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("v1" to "Классический", "v2" to "Современный").forEach { (id, title) ->
                Surface(onClick = { onChange(id) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(if (id == selected) 2.dp else 1.dp, if (id == selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.fillMaxWidth().height(60.dp).background(MaterialTheme.colorScheme.background, RoundedCornerShape(8.dp)).padding(7.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(Modifier.fillMaxWidth().height(if (id == "v2") 23.dp else 7.dp).background(if (id == "v2") Color(0xff202633) else MaterialTheme.colorScheme.primary.copy(alpha = .2f), RoundedCornerShape(3.dp)))
                            repeat(if (id == "v1") 3 else 1) { Box(Modifier.fillMaxWidth().height(7.dp).background(MaterialTheme.colorScheme.surface, RoundedCornerShape(2.dp))) }
                        }
                        Text(title, style = MaterialTheme.typography.labelLarge)
                        Text(id.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        Text(if (id == "v1") "Компактное меню" else "Панели и навигация", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
