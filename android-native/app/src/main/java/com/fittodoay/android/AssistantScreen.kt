package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.key.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONObject

@Composable fun AssistantScreen(model: AppModel) {
    if (model.draftLoading) {
        Page { ScreenHeading("", "Создать программу с помощником", ""); LinearProgressIndicator(Modifier.fillMaxWidth()) }
        return
    }
    val saved = remember(model.token) { model.assistantAnswers() }
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
        ScreenHeading("", "Создать программу с помощником", "Ответьте на несколько вопросов — и помощник подберёт программу на основе каталога упражнений.")
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
        } ?: FitCard(padding = 24.dp) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                steps.forEachIndexed { index, title ->
                    Column(Modifier.weight(1f)) {
                        Surface(shape = androidx.compose.foundation.shape.CircleShape, color = if (index == step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
                            Box(Modifier.size(28.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                                Text(if (index < step) "✓" else "%02d".format(index + 1), style = MaterialTheme.typography.labelSmall,
                                    color = if (index == step) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(if (index == 3) "Пожелания" else title, style = MaterialTheme.typography.labelSmall, color = if (index == step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 14.dp), color = MaterialTheme.colorScheme.outlineVariant)
            Text("ШАГ ${step + 1} / ${steps.size}", style = MaterialTheme.typography.labelSmall.copy(letterSpacing = androidx.compose.ui.unit.TextUnit(2f, androidx.compose.ui.unit.TextUnitType.Sp)))
            Text(steps[step], style = MaterialTheme.typography.headlineSmall)
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
    if (model.draftLoading) {
        Dialog(onDismissRequest = dismiss) { Surface(shape = MaterialTheme.shapes.large) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Открываем диалог…"); LinearProgressIndicator(Modifier.fillMaxWidth()); TextButton(onClick = dismiss) { Text("Закрыть") }
            }
        } }
        return
    }
    var input by rememberSaveable(model.chatProgram, stateSaver = androidx.compose.ui.text.input.TextFieldValue.Saver) {
        mutableStateOf(androidx.compose.ui.text.input.TextFieldValue(model.chatDraft()))
    }
    LaunchedEffect(input.text, model.chatProgram) { model.saveChatDraft(input.text) }
    var followLatest by remember { mutableStateOf(true) }
    var autoScrolling by remember { mutableStateOf(false) }
    fun submitMessage() {
        followLatest = true
        val draft = input.text.trim()
        model.send(draft) { if (input.text.trim() == draft) input = androidx.compose.ui.text.input.TextFieldValue("") }
    }
    val scroll = rememberLazyListState()
    LaunchedEffect(scroll) {
        snapshotFlow { Triple(scroll.isScrollInProgress, scroll.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0, scroll.layoutInfo.totalItemsCount) }
            .collect { (scrolling, last, count) -> if (scrolling && !autoScrolling) followLatest = last >= count - 2 }
    }
    var visibleThread by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(model.threadId, model.messages.size) {
        val changedThread = visibleThread != model.threadId
        if (changedThread) { visibleThread = model.threadId; followLatest = true }
        if (followLatest && model.messages.isNotEmpty()) {
            autoScrolling = true
            try {
                if (changedThread) scroll.scrollToItem(model.messages.lastIndex)
                else scroll.animateScrollToItem(model.messages.lastIndex)
            } finally { autoScrolling = false }
        }
    }
    Dialog(onDismissRequest = dismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
        val dialogView = LocalView.current
        val lightBars = MaterialTheme.colorScheme.surface.luminance() > .5f
        SideEffect {
            (dialogView.parent as? DialogWindowProvider)?.window?.let { window ->
                WindowCompat.getInsetsController(window, dialogView).apply {
                    isAppearanceLightStatusBars = lightBars; isAppearanceLightNavigationBars = lightBars
                }
            }
        }
        Surface(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().systemBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 840.dp).fillMaxSize().padding(horizontal = 16.dp, vertical = if (imeVisible) 8.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(if (imeVisible) 6.dp else 12.dp)) {
                Row { Text("AI-помощник", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge); TextButton(onClick = dismiss) { Text("Закрыть") } }
                if (model.chatThreads.size > 1) {
                    TextButton(onClick = { history = !history }, enabled = !model.chatBusy) { Text("История диалогов (${model.chatThreads.size})") }
                    if (history) LazyColumn(Modifier.heightIn(max = 180.dp)) {
                        items(model.chatThreads, key = { it.getInt("id") }) { thread ->
                            TextButton(onClick = { model.selectChat(thread); history = false }, enabled = !model.chatBusy) {
                                Text("${thread.text("title")} · ${thread.text("created_at").take(10)} · #${thread.getInt("id")}" + if (model.threadId == thread.getInt("id")) " ✓" else "")
                            }
                        }
                    }
                }
                model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                model.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("chat-messages"), state = scroll,
                    verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
                    if (model.messages.isEmpty()) item { Text("Задайте вопрос или опишите, что хотите изменить в программе.") }
                    itemsIndexed(model.messages, key = { index, message -> message.text("id").ifBlank { "message-$index" } }, contentType = { _, _ -> "message" }) { _, message ->
                        val userMessage = message.text("role") == "user"
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = if (userMessage) Alignment.End else Alignment.Start) {
                        Card(modifier = Modifier.fillMaxWidth(if (userMessage) .92f else 1f), colors = CardDefaults.cardColors(containerColor = if (userMessage) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface)) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(if (userMessage) "Вы" else "Помощник", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(message.text("content"), style = MaterialTheme.typography.bodyMedium)
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
                                    Action("Применить изменения", !model.chatBusy) { model.proposal(message.getInt("id"), true) }
                                    TextButton(onClick = { model.proposal(message.getInt("id"), false) }, enabled = !model.chatBusy) { Text("Отклонить") }
                                } else if (message.text("proposal_status") in listOf("applied", "cancelled")) Text(if (message.text("proposal_status") == "applied") "Изменения применены" else "Предложение отклонено")
                            }
                        }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(3.dp)) { if (model.chatBusy) LinearProgressIndicator(Modifier.fillMaxWidth()) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(input, { input = it }, Modifier.weight(1f).onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter) {
                        if (event.isShiftPressed) {
                            val start = input.selection.min; val end = input.selection.max
                            input = androidx.compose.ui.text.input.TextFieldValue(input.text.replaceRange(start, end, "\n"), androidx.compose.ui.text.TextRange(start + 1))
                        } else if (!model.chatBusy && model.threadId != null && input.text.isNotBlank()) submitMessage()
                        true
                    } else false
                }, label = { Text("Сообщение") }, textStyle = MaterialTheme.typography.bodyMedium, maxLines = if (imeVisible) 3 else 5,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Send),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { if (!model.chatBusy && model.threadId != null && input.text.isNotBlank()) submitMessage() }))
                Button(onClick = ::submitMessage, enabled = !model.chatBusy && model.threadId != null && input.text.isNotBlank(), modifier = Modifier.heightIn(min = 56.dp), contentPadding = PaddingValues(horizontal = 12.dp)) { Text("Отправить", style = MaterialTheme.typography.labelMedium) }
                }
            }
        }
    }
    }
    exerciseInfo?.let { ExerciseInfo(it, model) { exerciseInfo = null } }
}
