package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
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
    val progress = if (total == 0) 0f else completed.toFloat() / total
    val focus = summarizeMuscles(exercises, logs).take(2).joinToString(" + ") { it.name.replaceFirstChar(Char::titlecase) }.ifEmpty { "Время восстановиться" }
    val accent = MaterialTheme.colorScheme.primary
    MaterialTheme(colorScheme = fitColors(true, accent, true)) {
        Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Color(0xff202633), contentColor = Color.White) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(18.dp)) {
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
                if (exercises.isNotEmpty()) {
                    HorizontalDivider(color = Color(0xff343c4b))
                    Text("Группы мышц", style = MaterialTheme.typography.labelMedium)
                    MuscleSummary(exercises, logs, model.preferences.text("muscle_summary_view", "chips"))
                }
            }
        }
    }
}

@Composable private fun OverviewMetric(value: String, label: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xffb6bfce))
    }
}
