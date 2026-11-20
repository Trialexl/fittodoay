package com.fittodoay.android

import android.media.ToneGenerator
import android.media.AudioManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material.icons.outlined.Edit
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
    var weight by remember(model.plan) { mutableStateOf(model.plan.optJSONObject("weigh_in")?.text("weight_kg").orEmpty()) }
    var info by remember { mutableStateOf<JSONObject?>(null) }
    var chat by remember { mutableStateOf(false) }
    var calendar by remember { mutableStateOf(false) }
    var deletePath by remember { mutableStateOf<String?>(null) }
    val logs = model.plan.array("logs")
    val total = model.plan.array("folders").sumOf { f -> f.array("templates").sumOf { t -> t.array("exercises").filter { it.optBoolean("is_active", true) }.sumOf { e -> e.array("sets").size } } }
    val modern = model.preferences.text("design_version", "v1") == "v2"
    val exercises = model.plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }.filter { it.optBoolean("is_active", true) }
    Page {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(if (modern) "ТВОЙ ПЛАН НА ДЕНЬ" else "ДНЕВНОЙ ЧЕКЛИСТ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (modern) Text("Тренировка", style = MaterialTheme.typography.headlineLarge)
            }
            OutlinedButton(onClick = { calendar = true }, modifier = Modifier.semantics { contentDescription = "Открыть календарь тренировок" }, shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)) {
                Text(model.date, style = MaterialTheme.typography.labelMedium)
            }
        }
        if (modern) WorkoutOverview(model, exercises, logs, total)
        FitCard(Modifier.testTag("body-weight-panel"), padding = 10.dp) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Вес перед тренировкой", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                Box(Modifier.width(88.dp)) { Field("Вес, кг", weight, { weight = it }) }
                OutlinedIconButton(onClick = { model.weighIn(weight) }, enabled = !model.busy, shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)) {
                    Icon(androidx.compose.material.icons.Icons.Outlined.Check, "Сохранить вес", Modifier.size(18.dp))
                }
            }
        }
        if (!modern && exercises.isNotEmpty()) FitCard {
            MuscleSummary(exercises, logs, model.preferences.text("muscle_summary_view", "chips"))
        }

        if (model.plan.array("folders").isEmpty() && !model.busy) Panel("День без тренировок") {
            Text("На эту дату нет активных тренировок. Выберите другую дату или настройте расписание программы.")
            Action("К программам") { model.navigate(Screen.Programs) }
        }
        model.plan.array("folders").forEach { folder ->
            FitCard(Modifier.testTag("workout-program-${folder.getInt("id")}")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(folder.text("name"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    OutlinedButton(onClick = { chat = true; model.openChat(folder.getInt("id"), "post_workout_review", "Разбери тренировку за ${model.date}: оцени фактические результаты и предложи обоснованные изменения, если они доступны.") }, enabled = !model.busy,
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) { Text("✧ AI") }
                }
                val expected = folder.array("templates").flatMap { it.array("exercises") }.filter { it.optBoolean("is_active", true) }
                    .flatMap { exercise -> exercise.array("sets").map { exercise.optInt("template_exercise_id") to it.optInt("set_index") } }
                val completed = expected.isNotEmpty() && expected.all { pair -> logs.any { it.optInt("template_exercise") == pair.first && it.optInt("set_index") == pair.second } }
                if (completed) Text("Все ${expected.size} подходов записаны", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                folder.array("templates").forEach { template ->
                    Text(template.text("name"), style = MaterialTheme.typography.titleMedium)
                    template.array("exercises").forEach { exercise ->
                        val source = exercise.optJSONObject("source") ?: JSONObject()
                        val defaults = exercise.optJSONObject("defaults") ?: JSONObject()
                        Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(source.text("name"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                                    IconButton(onClick = { info = source }) { Icon(androidx.compose.material.icons.Icons.Outlined.Info, "Техника и описание", Modifier.size(18.dp)) }
                                }
                                if (exercise.text("note").isNotEmpty()) Text(exercise.text("note"))
                                if (!exercise.optBoolean("is_active", true)) Text("Упражнение выключено")
                                else exercise.array("sets").forEach { set ->
                                    val logged = logs.find { it.optInt("template_exercise") == exercise.optInt("template_exercise_id") && it.optInt("set_index") == set.optInt("set_index") }
                                    SetRow(model, exercise, set, defaults, logged) { if (it.optBoolean("queued")) model.cancelQueued(it) else deletePath = "/api/workouts/logs/${it.getInt("id")}/" }
                                }
                            }
                        }
                    }
                }
            }
        }
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
    val key = "${model.plan.optInt("id")}:${exercise.optInt("template_exercise_id")}:${set.optInt("set_index")}:${logged?.toString()}"
    var reps by remember(key) { mutableStateOf(logged?.text("actual_reps") ?: set.text("default_reps", "10")) }
    var weight by remember(key) { mutableStateOf(logged?.text("actual_weight") ?: set.text("default_weight", "0")) }
    var time by remember(key) { mutableStateOf(logged?.text("actual_time") ?: set.text("default_time", "30")) }
    val source = exercise.optJSONObject("source") ?: JSONObject()
    val hasWeight = defaults.optBoolean("has_weight", source.optBoolean("has_weight"))
    val hasTime = defaults.optBoolean("has_time", source.optBoolean("has_time"))
    var editing by remember(key) { mutableStateOf(false) }
    val planned = if (hasTime) "${set.text("default_time", "30")} сек" else "${set.text("default_reps", "10")} повт." + if (hasWeight) " · ${set.text("default_weight", "0")} кг" else ""
    val actual = if (hasTime) "$time сек" else "$reps повт." + if (hasWeight) " · $weight кг" else ""
    Surface(Modifier.fillMaxWidth(), shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
        color = if (logged != null) MaterialTheme.colorScheme.primary.copy(alpha = .055f) else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, if (logged != null) MaterialTheme.colorScheme.primary.copy(alpha = .18f) else MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (logged != null) "✓" else set.optInt("set_index").toString().padStart(2, '0'), style = MaterialTheme.typography.titleMedium,
                    color = if (logged != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 12.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (logged != null) "Результат" else "План", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (logged != null) actual else planned, style = MaterialTheme.typography.titleSmall)
                }
                IconButton(onClick = { editing = !editing }) {
                    Icon(androidx.compose.material.icons.Icons.Outlined.Edit, "Изменить подход ${set.optInt("set_index")}", Modifier.size(18.dp))
                }
            }
            if (logged != null) Text("План: $planned", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (editing) {
                if (!hasTime) NumberControl("Повторы", reps, { reps = it }, 1.0)
                if (hasWeight && !hasTime) NumberControl("Вес, кг", weight, { weight = it }, 2.0)
                if (hasTime) NumberControl("Время, сек", time, { time = it }, 1.0)
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                if (hasTime && logged == null) TextButton(onClick = {
                    val duration = time.toIntOrNull() ?: 0
                    if (duration > 0) model.startExecution(exercise, set, reps, weight, time)
                }, enabled = !model.busy) { Text("Таймер") }
                if (logged == null || editing) Button(onClick = { model.logSet(exercise, set, reps, weight, time, logged) }, shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp), enabled = !model.busy && (reps.toIntOrNull() ?: 0) >= 0) { Text(if (logged == null) "Выполнено" else "Сохранить") }
                if (logged != null && editing) TextButton(onClick = { delete(logged) }, enabled = !model.busy) { Text("Отменить") }
            }
        }
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

@Composable fun TimerDialogs(model: AppModel) {
    val execution = model.executionUntil > 0
    val end = if (execution) model.executionUntil else model.restUntil
    if (end <= 0) return
    var remaining by remember(end) { mutableIntStateOf(ceil((end - System.currentTimeMillis()) / 1000.0).toInt().coerceAtLeast(0)) }
    val context = LocalContext.current
    LaunchedEffect(end) {
        while (remaining > 0) { delay(250); remaining = ceil((end - System.currentTimeMillis()) / 1000.0).toInt().coerceAtLeast(0) }
        model.signalTimer(execution)
    }
    Dialog(onDismissRequest = { if (execution) { model.executionUntil = 0; model.executionDone = null } else model.restUntil = 0 }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (execution) "Выполнение" else "Время восстановиться", style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(40.dp))
                Text("${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')}", style = MaterialTheme.typography.displayLarge)
                Text(if (remaining == 0) "Готово" else if (execution) "Сохраняйте технику" else "Следующий подход уже близко")
                Spacer(Modifier.height(40.dp))
                Action(if (execution) "Завершить подход" else "Продолжить тренировку", !execution || !model.busy) {
                    if (execution) model.finishExecution() else model.restUntil = 0
                }
                if (!execution) TextButton(onClick = { model.restUntil = System.currentTimeMillis() + model.restDuration * 1000L }) { Text("Начать отдых заново") }
                else TextButton(onClick = { model.executionUntil = 0; model.executionDone = null }) { Text("Отменить таймер") }
            }
        }
    }
}
