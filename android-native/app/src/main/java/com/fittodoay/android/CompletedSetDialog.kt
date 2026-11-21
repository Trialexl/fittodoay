package com.fittodoay.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONObject

@OptIn(ExperimentalLayoutApi::class)
@Composable fun CompletedSetDialog(model: AppModel, exercise: JSONObject, set: JSONObject, defaults: JSONObject, logged: JSONObject, dismiss: () -> Unit) {
    val source = exercise.optJSONObject("source") ?: JSONObject()
    val timed = defaults.optBoolean("has_time", source.optBoolean("has_time"))
    val weighted = defaults.optBoolean("has_weight", source.optBoolean("has_weight")) && !timed
    var reps by remember { mutableStateOf(logged.text("actual_reps")) }
    var weight by remember { mutableStateOf(logged.text("actual_weight")) }
    var time by remember { mutableStateOf(logged.text("actual_time")) }
    var validation by remember { mutableStateOf<String?>(null) }
    Dialog(onDismissRequest = { if (model.workoutSaving == 0) dismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        BoxWithConstraints(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(8.dp)) {
            val compact = maxWidth < 640.dp
            Surface(Modifier.align(if (compact) Alignment.BottomCenter else Alignment.Center).widthIn(max = 512.dp).fillMaxWidth().heightIn(max = maxHeight).testTag("completed-set-dialog"), shape = RoundedCornerShape(if (compact) 18.dp else 20.dp)) {
                Column(Modifier.padding(if (compact) 18.dp else 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Правка подхода", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                            Text(source.text("name"), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = dismiss, enabled = model.workoutSaving == 0, modifier = Modifier.size(32.dp)) { Icon(Icons.Outlined.Close, "Закрыть правку", Modifier.size(16.dp)) }
                    }
                    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            if (timed) WorkoutNumberControl("Время (сек)", time, { time = it }, 1.0, Modifier.width(192.dp), dark = false, enabled = model.workoutSaving == 0)
                            else {
                                WorkoutNumberControl("Повторы", reps, { reps = it }, 1.0, Modifier.width(192.dp), dark = false, enabled = model.workoutSaving == 0)
                                if (weighted) WorkoutNumberControl("Вес (кг)", weight, { weight = it }, 2.0, Modifier.width(192.dp), dark = false, enabled = model.workoutSaving == 0)
                            }
                        }
                        (validation ?: model.error)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    }
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = dismiss, enabled = model.workoutSaving == 0, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant), shape = RoundedCornerShape(12.dp)) { Text("Отмена") }
                        OutlinedButton(onClick = {
                            model.undoCompletedSet(logged, dismiss)
                        }, enabled = model.workoutSaving == 0, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .2f)), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), shape = RoundedCornerShape(12.dp)) { Text("Отменить выполнение") }
                        Button(onClick = {
                            try { setLogPayload(model.plan.getInt("id"), exercise, set.getInt("set_index"), reps, weight, time); validation = null }
                            catch (e: IllegalArgumentException) { validation = e.message; return@Button }
                            model.logSet(exercise, set, reps, weight, time, logged, onSaved = dismiss)
                        }, enabled = model.workoutSaving == 0, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), shape = RoundedCornerShape(12.dp)) { Text("Сохранить") }
                    }
                }
            }
        }
    }
}
