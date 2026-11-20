package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.key.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONObject

@Composable fun AssistantScreen(model: AppModel) {
    val saved = remember(model.preferences) { model.assistantAnswers() }
    var gender by remember(saved) { mutableStateOf(saved.text("gender", "male")) }
    var goal by remember(saved) { mutableStateOf(saved.text("goal", "strength")) }
    var age by remember(saved) { mutableStateOf(saved.text("age", "30")) }
    var weight by remember(saved) { mutableStateOf(saved.text("weight_kg", "80")) }
    var height by remember(saved) { mutableStateOf(saved.text("height_cm", "180")) }
    var sessions by remember(saved) { mutableStateOf(saved.text("sessions_per_week", "3")) }
    var duration by remember(saved) { mutableStateOf(saved.text("session_duration", "60")) }
    var notes by remember(saved) { mutableStateOf(saved.text("notes")) }
    LaunchedEffect(gender, goal, age, weight, height, sessions, duration, notes) {
        model.saveAssistantAnswers(obj("gender" to gender, "goal" to goal, "age" to age, "weight_kg" to weight, "height_cm" to height,
            "sessions_per_week" to sessions, "session_duration" to duration, "notes" to notes))
    }
    var step by rememberSaveable { mutableIntStateOf(0) }
    val steps = listOf("Основная информация", "Цель", "Режим", "Дополнительные пожелания")
    var chat by remember { mutableStateOf(false) }
    Page {
        FitCard {
            Text("Создать программу с помощником", style = MaterialTheme.typography.headlineSmall)
            Text("Ответьте на несколько вопросов — и помощник подберёт программу на основе каталога упражнений.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        model.preview?.let { preview ->
            Panel("Проверьте программу") {
                preview.optJSONObject("plan")?.array("programs")?.forEach { program ->
                    Text(program.text("name"), style = MaterialTheme.typography.titleMedium)
                    if (program.text("comment").isNotBlank()) Text(program.text("comment"))
                    program.array("days").forEach { day ->
                        Text(day.text("name"), style = MaterialTheme.typography.titleSmall)
                        Text(scheduleLabel(day))
                        if (day.text("comment").isNotBlank()) Text(day.text("comment"))
                        day.array("exercises").forEach { exercise ->
                            val amount = if (!exercise.isNull("time")) "${exercise.text("time")} сек" else "${exercise.text("reps", "—")} повт."
                            Text("${exercise.text("exercise_name", exercise.text("exercise_id"))} · ${exercise.text("sets")} × $amount" + if (!exercise.isNull("weight")) " · ${exercise.text("weight")} кг" else "")
                            if (!exercise.isNull("rest")) Text("Отдых: ${exercise.text("rest")} сек", style = MaterialTheme.typography.bodySmall)
                            if (exercise.text("note").isNotBlank()) Text(exercise.text("note"), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Action("Создать эти программы", !model.busy, model::applyPreview)
                TextButton(onClick = model::discardPreview) { Text("Изменить ответы") }
            }
        } ?: Panel("Шаг ${step + 1} / ${steps.size} · ${steps[step]}") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                steps.forEachIndexed { index, title ->
                    Column(Modifier.weight(1f)) {
                        Text(if (index < step) "✓" else "%02d".format(index + 1),
                            color = if (index == step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.titleSmall)
                        Text(title, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            when (step) {
                0 -> { Choices("Пол", gender, genders) { gender = it }; Field("Возраст", age, { age = it }); Field("Вес, кг", weight, { weight = it }); Field("Рост, см", height, { height = it }) }
                1 -> Choices("Что в приоритете", goal, goals) { goal = it }
                2 -> { Field("Тренировок в неделю", sessions, { sessions = it }); Field("Длительность тренировки, мин", duration, { duration = it }) }
                else -> OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Оборудование, ограничения, пожелания") }, minLines = 4)
            }
            if (step < steps.lastIndex) Action("Далее", !model.busy) { step++ }
            else Action("Подготовить программу", !model.busy) {
                model.generate(obj("gender" to gender, "goal" to goal, "age" to age.toIntOrNull(), "weight_kg" to weight.replace(',', '.').toDoubleOrNull(),
                    "height_cm" to height.replace(',', '.').toDoubleOrNull(), "sessions_per_week" to sessions.toIntOrNull(), "session_duration" to duration.toIntOrNull(), "notes" to notes))
            }
            if (step > 0) TextButton(onClick = { step-- }, enabled = !model.busy) { Text("Назад") }
        }
        if (model.folders.isNotEmpty()) Panel("Обсудить существующую программу") {
            model.folders.forEach { program -> TextButton(onClick = { chat = true; model.openChat(program.getInt("id")) }, enabled = !model.busy) { Text(program.text("name")) } }
        }
    }
    if (chat) ChatDialog(model) { chat = false }
}

@Composable fun ChatDialog(model: AppModel, dismiss: () -> Unit) {
    var exerciseInfo by remember { mutableStateOf<JSONObject?>(null) }
    var history by remember { mutableStateOf(false) }
    var input by rememberSaveable(model.chatProgram, stateSaver = androidx.compose.ui.text.input.TextFieldValue.Saver) {
        mutableStateOf(androidx.compose.ui.text.input.TextFieldValue(model.chatDraft()))
    }
    LaunchedEffect(input.text, model.chatProgram) { model.saveChatDraft(input.text) }
    fun submitMessage() {
        val draft = input.text.trim()
        model.send(draft) { if (input.text.trim() == draft) input = androidx.compose.ui.text.input.TextFieldValue("") }
    }
    val scroll = rememberScrollState()
    LaunchedEffect(model.messages.size, model.busy) { scroll.animateScrollTo(scroll.maxValue) }
    Dialog(onDismissRequest = dismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row { Text("AI-помощник", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge); TextButton(onClick = dismiss) { Text("Закрыть") } }
                if (model.chatThreads.size > 1) {
                    TextButton(onClick = { history = !history }, enabled = !model.busy) { Text("История диалогов (${model.chatThreads.size})") }
                    if (history) Column(Modifier.heightIn(max = 180.dp).verticalScroll(rememberScrollState())) {
                        model.chatThreads.forEach { thread ->
                            TextButton(onClick = { model.selectChat(thread); history = false }, enabled = !model.busy) {
                                Text("${thread.text("title")} · ${thread.text("created_at").take(10)} · #${thread.getInt("id")}" + if (model.threadId == thread.getInt("id")) " ✓" else "")
                            }
                        }
                    }
                }
                model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                model.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                Column(Modifier.weight(1f).verticalScroll(scroll), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (model.messages.isEmpty()) Text("Задайте вопрос или опишите, что хотите изменить в программе.")
                    model.messages.forEach { message ->
                        Card(colors = CardDefaults.cardColors(containerColor = if (message.text("role") == "user") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(if (message.text("role") == "user") "Вы" else "Помощник", style = MaterialTheme.typography.labelLarge)
                                Text(message.text("content"))
                                val actions = message.array("actions")
                                val mentioned = model.chatReferences.mapNotNull { reference ->
                                    val source = reference.optJSONObject("exercise") ?: reference.optJSONObject("custom_exercise")
                                    source?.takeIf { it.text("name").isNotBlank() && (message.text("content").contains(it.text("name"), ignoreCase = true) || actions.any { action -> action.optInt("template_exercise_id", -1) == reference.optInt("id") }) }
                                } + actions.mapNotNull { action ->
                                    action.text("exercise_id").takeIf { it.isNotBlank() && action.text("exercise_name").isNotBlank() }?.let { obj("id" to it, "name" to action.text("exercise_name")) }
                                }
                                mentioned.distinctBy { it.text("id") }.forEach { source ->
                                    TextButton(onClick = { exerciseInfo = source }) { Text("Техника и статистика · ${source.text("name")}") }
                                }
                                if (message.text("proposal_status") == "pending" && actions.isNotEmpty()) {
                                    actions.forEach { action ->
                                        val title = when (action.text("type", action.text("action_type"))) {
                                            "add_exercise" -> "Добавить упражнение"
                                            "replace_exercise" -> "Заменить упражнение"
                                            "remove_exercise" -> "Удалить упражнение"
                                            "update_weight" -> "Обновить нагрузку"
                                            "create_custom_exercise" -> "Создать упражнение"
                                            else -> "Изменение программы"
                                        }
                                        Text("$title: ${action.text("exercise_name", action.text("day_name"))}", style = MaterialTheme.typography.bodyMedium)
                                        listOf("sets" to "Подходы", "reps" to "Повторы", "weight" to "Вес", "time" to "Время", "rest" to "Отдых").filter { !action.isNull(it.first) }.forEach { (key, label) -> Text("$label: ${action.text(key)}") }
                                    }
                                    Action("Применить изменения", !model.busy) { model.proposal(message.getInt("id"), true) }
                                    TextButton(onClick = { model.proposal(message.getInt("id"), false) }, enabled = !model.busy) { Text("Отклонить") }
                                } else if (message.text("proposal_status") in listOf("applied", "cancelled")) Text(if (message.text("proposal_status") == "applied") "Изменения применены" else "Предложение отклонено")
                            }
                        }
                    }
                }
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                OutlinedTextField(input, { input = it }, Modifier.fillMaxWidth().onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter) {
                        if (event.isShiftPressed) {
                            val start = input.selection.min; val end = input.selection.max
                            input = androidx.compose.ui.text.input.TextFieldValue(input.text.replaceRange(start, end, "\n"), androidx.compose.ui.text.TextRange(start + 1))
                        } else if (!model.busy && model.threadId != null && input.text.isNotBlank()) submitMessage()
                        true
                    } else false
                }, label = { Text("Сообщение") }, maxLines = 5,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Send),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { if (!model.busy && model.threadId != null && input.text.isNotBlank()) submitMessage() }))
                Action("Отправить", !model.busy && model.threadId != null && input.text.isNotBlank(), ::submitMessage)
            }
        }
    }
    exerciseInfo?.let { ExerciseInfo(it, model) { exerciseInfo = null } }
}
