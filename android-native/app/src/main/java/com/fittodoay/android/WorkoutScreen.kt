package com.fittodoay.android

import android.media.ToneGenerator
import android.media.AudioManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Info
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.ceil
import kotlin.math.roundToInt

@Composable fun WorkoutScreen(model: AppModel) {
    var weight by remember(model.plan) { mutableStateOf(model.plan.optJSONObject("weigh_in")?.text("weight_kg").orEmpty().replace('.', ',')) }
    var info by remember { mutableStateOf<JSONObject?>(null) }
    var chat by remember { mutableStateOf(false) }
    var calendar by remember { mutableStateOf(false) }
    var deletePath by remember { mutableStateOf<String?>(null) }
    val logs = model.plan.array("logs")
    val total = model.plan.array("folders").sumOf { f -> f.array("templates").sumOf { t -> t.array("exercises").filter { it.optBoolean("is_active", true) }.sumOf { e -> e.array("sets").size } } }
    val modern = true
    val exercises = model.plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }.filter { it.optBoolean("is_active", true) }
    Page {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(if (modern) "ТВОЙ ПЛАН НА ДЕНЬ" else "ДНЕВНОЙ ЧЕКЛИСТ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (modern) Text("Тренировка", style = MaterialTheme.typography.headlineLarge)
            }
            OutlinedButton(onClick = { calendar = true }, modifier = Modifier.semantics { contentDescription = "Открыть календарь тренировок" }, shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)) {
                Icon(androidx.compose.material.icons.Icons.Outlined.CalendarMonth, null, Modifier.size(15.dp)); Spacer(Modifier.width(6.dp))
                Text(LocalDate.parse(model.date).format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.forLanguageTag("ru"))), style = MaterialTheme.typography.bodySmall)
            }
        }
        if (modern) WorkoutOverview(model, exercises, logs, total)
        if (exercises.isNotEmpty() && (!modern || model.preferences.text("muscle_summary_view", "chips") != "chips")) FitCard {
            MuscleSummary(exercises, logs, model.preferences.text("muscle_summary_view", "chips"))
        }
        BodyWeightCard(model, weight) { weight = it }

        if (model.plan.array("folders").isEmpty() && !model.busy) Panel("День без тренировок") {
            Text("На эту дату нет активных тренировок. Выберите другую дату или настройте расписание программы.")
            Action("К программам") { model.navigate(Screen.Programs) }
        }
        WorkoutChecklist(model, info = { info = it }, chat = { folder ->
            chat = true; model.openChat(folder.getInt("id"), "post_workout_review", "Разбери тренировку за ${model.date}: оцени фактические результаты и предложи обоснованные изменения, если они доступны.")
        }, delete = { log -> if (log.optBoolean("queued")) model.cancelQueued(log) else deletePath = "/api/workouts/logs/${log.getInt("id")}/" })
        if (model.recommendations.isNotEmpty()) {
            OutlinedButton(onClick = model::recommendations, Modifier.fillMaxWidth(), enabled = !model.busy) { Text("Рекомендации по прогрессии") }
            model.recommendations.forEach { folder ->
                Panel(folder.text("folder_name")) {
                    val eligible = mutableListOf<JSONObject>()
                    folder.array("recommendations").forEach { recommendation ->
                        Text(recommendation.text("exercise_name"), style = MaterialTheme.typography.titleSmall)
                        Text("Повторы: ${recommendation.text("current_reps", "—")} → ${recommendation.text("suggested_reps", "—")} · Вес: ${recommendation.text("current_weight", "—")} → ${recommendation.text("suggested_weight", "—")}")
                        Text(recommendation.text("reason"))
                        if (!recommendation.optBoolean("informational")) {
                            val item = obj("template_exercise_id" to recommendation.getInt("template_exercise_id"))
                            if (!recommendation.isNull("suggested_reps")) item.put("rep_override", recommendation.get("suggested_reps"))
                            if (!recommendation.isNull("suggested_weight")) item.put("weight_override", recommendation.get("suggested_weight"))
                            if (item.length() > 1) eligible.add(item)
                        }
                    }
                    if (eligible.isNotEmpty()) Action("Применить рекомендации", !model.busy) { model.applyRecommendations(eligible) }
                }
            }
        }
    }
    info?.let { ExerciseInfo(it, model) { info = null } }
    if (calendar) WorkoutCalendar(model) { calendar = false }
    if (chat) ChatDialog(model) { chat = false }
    deletePath?.let { path -> ConfirmDelete("запись подхода", { deletePath = null }) { model.delete(path) } }
}

@Composable fun SetRow(model: AppModel, exercise: JSONObject, set: JSONObject, defaults: JSONObject, logged: JSONObject?, delete: (JSONObject) -> Unit) {
    val key = "${model.plan.optInt("id")}:${exercise.optInt("template_exercise_id")}:${set.optInt("set_index")}:$set:$defaults:${logged?.toString()}"
    var reps by remember(key) { mutableStateOf(logged?.text("actual_reps") ?: set.text("default_reps", defaults.text("reps", "10"))) }
    var weight by remember(key) { mutableStateOf(logged?.text("actual_weight") ?: set.text("default_weight", defaults.text("weight", "0"))) }
    var time by remember(key) { mutableStateOf(logged?.text("actual_time") ?: set.text("default_time", defaults.text("time", "30"))) }
    val source = exercise.optJSONObject("source") ?: JSONObject()
    val hasWeight = defaults.optBoolean("has_weight", source.optBoolean("has_weight"))
    val hasTime = defaults.optBoolean("has_time", source.optBoolean("has_time"))
    var editing by remember(key) { mutableStateOf(false) }
    val planned = if (hasTime) "${set.text("default_time", defaults.text("time", "30"))} сек" else "${set.text("default_reps", defaults.text("reps", "10"))} повт." + if (hasWeight) " · ${set.text("default_weight", defaults.text("weight", "0"))} кг" else ""
    val actual = if (hasTime) "$time сек" else "$reps повт." + if (hasWeight) " · $weight кг" else ""
    Column(Modifier.fillMaxWidth().testTag("set-row-${exercise.optInt("template_exercise_id")}-${set.optInt("set_index")}")) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(shape = androidx.compose.foundation.shape.CircleShape, color = if (logged != null) androidx.compose.ui.graphics.Color(0xffdcfce7) else MaterialTheme.colorScheme.surfaceVariant) {
                Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                    Text(if (logged != null) "✓" else set.optInt("set_index").toString().padStart(2, '0'), style = MaterialTheme.typography.bodySmall,
                        color = if (logged != null) androidx.compose.ui.graphics.Color(0xff15803d) else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(if (logged != null) "Результат" else "План", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (logged != null) actual else planned, style = MaterialTheme.typography.titleSmall)
                if (logged?.optBoolean("queued") == true) Text("В очереди · сохранено на устройстве", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                if (logged != null) Text("План: $planned", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (logged != null) IconButton(onClick = { model.error = null; editing = true }, modifier = Modifier.size(48.dp)) { Icon(androidx.compose.material.icons.Icons.Outlined.Edit, "Изменить подход ${set.optInt("set_index")}", Modifier.size(16.dp)) }
            if (logged == null) OutlinedButton(onClick = {
                if (hasTime) { if ((time.toIntOrNull() ?: 0) > 0) model.startExecution(exercise, set, reps, weight, time) }
                else model.openRest(exercise, set, reps, weight, time)
            }, shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp), enabled = !model.busy && !model.workoutTimerActive) {
                Text(if (hasTime) "▷ Начать" else "+ Отметить", style = MaterialTheme.typography.labelLarge)
            }
        }
        if (editing && logged != null) CompletedSetDialog(model, exercise, set, defaults, logged) { editing = false }

    }
}

@Composable fun NumberControl(label: String, value: String, onChange: (String) -> Unit, step: Double) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(value, onChange, Modifier.weight(1f), label = { Text(label) }, singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal))
        val current by rememberUpdatedState(value); val change by rememberUpdatedState(onChange)
        fun adjust(delta: Double) { val next = ((current.replace(',', '.').toDoubleOrNull() ?: 0.0) + delta).coerceAtLeast(0.0); change(if (next % 1.0 == 0.0) next.toInt().toString() else next.toString()) }
        RepeatButton("−") { adjust(-step) }; RepeatButton("+") { adjust(step) }
    }
}

@Composable private fun RepeatButton(label: String, action: () -> Unit) {
    val interactions = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState(); val latest by rememberUpdatedState(action)
    LaunchedEffect(pressed) { if (pressed) { delay(400); while (true) { latest(); delay(90) } } }
    TextButton(onClick = action, interactionSource = interactions) { Text(label) }
}
