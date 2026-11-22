package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import kotlin.math.roundToInt

@Composable fun WorkoutOverview(model: AppModel, exercises: List<JSONObject>, logs: List<JSONObject>, total: Int) {
    val expected = exercises.flatMap { e -> e.array("sets").map { e.optInt("template_exercise_id") to it.optInt("set_index") } }
    val completed = expected.count { pair -> logs.any { it.optInt("template_exercise") == pair.first && it.optInt("set_index") == pair.second } }
    val progress by animateFloatAsState(if (total == 0) 0f else completed.toFloat() / total, tween(320), label = "workout-progress")
    val focus = summarizeMuscles(exercises, logs).take(2).joinToString(" + ") { it.name.replaceFirstChar(Char::titlecase) }.ifEmpty { "Время восстановиться" }
    val accent = MaterialTheme.colorScheme.primary
    MaterialTheme(colorScheme = fitColors(true, accent, true)) {
        Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Color(0xff202633), contentColor = Color.White) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("СЕГОДНЯ В ФОКУСЕ", style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp), color = Color(0xffb6bfce))
                        Text(focus, style = MaterialTheme.typography.titleMedium)
                    }
                    Box(contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(progress = { progress }, modifier = Modifier.size(68.dp), strokeWidth = 4.dp, color = accent, trackColor = Color(0xff363e4d))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${(progress * 100).roundToInt()}%", style = MaterialTheme.typography.titleLarge)
                            Text("$completed из $total", style = MaterialTheme.typography.labelSmall, color = Color(0xffb6bfce))
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    OverviewMetric(exercises.size.toString(), "упражнений")
                    OverviewMetric(total.toString(), "подходов в плане")
                    OverviewMetric(workoutLoad(model.plan).roundToInt().toString(), "нагрузка за день")
                }
                if (exercises.isNotEmpty() && model.preferences.text("muscle_summary_view", "chips") == "chips") {
                    HorizontalDivider(color = Color(0xff343c4b))
                    var musclesExpanded by remember { mutableStateOf(true) }
                    Row(Modifier.fillMaxWidth().clickable { musclesExpanded = !musclesExpanded }.heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Группы мышц", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                        Icon(if (musclesExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, "Группы мышц", Modifier.size(18.dp), tint = accent)
                    }
                    MotionDisclosure(musclesExpanded) { MuscleSummary(exercises, logs, "chips") }
                }
            }
        }
    }
}

@Composable private fun OverviewMetric(value: String, label: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xffb6bfce))
    }
}
