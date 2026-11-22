package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import kotlinx.coroutines.launch
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

@Composable fun ProgramsScreen(model: AppModel) {
    var editFolder by remember { mutableStateOf<JSONObject?>(null) }
    var editDay by remember { mutableStateOf<JSONObject?>(null) }
    var editExercise by remember { mutableStateOf<JSONObject?>(null) }
    var exerciseTemplate by remember { mutableIntStateOf(0) }
    var deletePath by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<JSONObject?>(null) }
    var chat by remember { mutableStateOf(false) }
    val modern = true
    var selectedFolder by rememberSaveable { mutableIntStateOf(0) }
    val folderIds = model.folders.map { it.optInt("id") }.toSet()
    var knownFolders by remember { mutableStateOf(folderIds) }
    LaunchedEffect(folderIds) {
        val added = folderIds - knownFolders
        if (knownFolders.isNotEmpty() && added.isNotEmpty()) selectedFolder = added.first()
        knownFolders = folderIds
    }
    val selectedId = selectedFolder.takeIf { id -> model.folders.any { it.optInt("id") == id } } ?: model.folders.firstOrNull()?.optInt("id")
    Page {
        ScreenHeading("Программы и шаблоны", "Мои программы", "Выбирайте программу, настраивайте дни и упражнения.")
        val programActions: @Composable (Modifier) -> Unit = { itemModifier ->
            Button(onClick = { model.navigate(Screen.Assistant) }, modifier = itemModifier, enabled = !model.busy,
                shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface)) { Text("Создать с помощником", maxLines = 2, style = MaterialTheme.typography.labelMedium) }
            Button(onClick = { editFolder = JSONObject() }, modifier = itemModifier, enabled = !model.busy,
                shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 12.dp)) { Text("Новая программа", maxLines = 2, style = MaterialTheme.typography.labelMedium) }
        }
        if (androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.2f) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { programActions(Modifier.fillMaxWidth()) }
        else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { programActions(Modifier.weight(1f)) }
        if (model.folders.isEmpty() && !model.busy) Text("Добавьте программу и запланируйте первый день тренировок.")
        if (modern && model.folders.isNotEmpty()) ModernProgramLibrary(model, selectedId, { selectedFolder = it }, { editFolder = JSONObject() })
        if (modern) model.folders.firstOrNull { it.optInt("id") == selectedId }?.let { folder ->
            ModernProgramFolder(model, folder, { editFolder = folder }, { editDay = obj("folder" to folder.getInt("id")) },
                { chat = true; model.openChat(folder.getInt("id")) }, { editDay = it },
                { day, exercise -> exerciseTemplate = day.getInt("id"); editExercise = exercise },
                { day -> exerciseTemplate = day.getInt("id"); editExercise = JSONObject(); model.loadCatalog() },
                { info = it }, { deletePath = it })
        }
        if (!modern) model.folders.filter { !modern || it.optInt("id") == selectedId }.forEach { folder ->
            var expanded by remember(folder.getInt("id"), modern) { mutableStateOf(modern) }
            Panel(folder.text("name"), Modifier.testTag("program-${folder.getInt("id")}")) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Свернуть" else "Открыть") }
                    if (expanded) {
                        Switch(folder.optBoolean("is_active"), { model.save("/api/programs/folders/", obj("is_active" to it), folder.getInt("id")) }, enabled = !model.busy)
                        Text(if (folder.optBoolean("is_active")) "Активна" else "Выключена", style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (expanded) {
                if (folder.text("comment").isNotEmpty()) Text(folder.text("comment"))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    TextButton(onClick = { editFolder = folder }) { Text("Изменить") }
                    TextButton(onClick = { editDay = obj("folder" to folder.getInt("id")) }) { Text("Добавить день") }
                    TextButton(onClick = { chat = true; model.openChat(folder.getInt("id")) }, enabled = !model.busy) { Text("AI") }
                    TextButton(onClick = { deletePath = "/api/programs/folders/${folder.getInt("id")}/" }) { Text("Удалить") }
                }
                if (expanded) model.templates.filter { it.optInt("folder") == folder.getInt("id") }.forEach { day ->
                    HorizontalDivider()
                    Text(day.text("name"), style = MaterialTheme.typography.titleMedium)
                    Text(scheduleLabel(day), style = MaterialTheme.typography.bodySmall)
                    Row(Modifier.horizontalScroll(rememberScrollState())) {
                        Switch(day.optBoolean("is_active"), { model.save("/api/programs/templates/", obj("is_active" to it), day.getInt("id")) }, enabled = !model.busy)
                        TextButton(onClick = { editDay = day }) { Text("Изменить день") }
                        TextButton(onClick = { deletePath = "/api/programs/templates/${day.getInt("id")}/" }) { Text("Удалить") }
                    }
                    day.array("template_exercises").forEachIndexed { index, exercise ->
                        val source = exercise.optJSONObject("exercise") ?: exercise.optJSONObject("custom_exercise") ?: JSONObject()
                        Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface) {
                            Column(Modifier.padding(12.dp)) {
                                Text(source.text("name"), style = MaterialTheme.typography.titleSmall)
                                Text("${exercise.text("set_override", source.text("default_sets", "3"))} × ${exercise.text("rep_override", source.text("default_reps", "10"))} · ${exercise.text("weight_override", source.text("default_weight", "0"))} кг")
                                Row(Modifier.horizontalScroll(rememberScrollState())) {
                                    TextButton(onClick = { info = source }) { Text("Инфо") }
                                    TextButton(onClick = { exerciseTemplate = day.getInt("id"); editExercise = exercise }) { Text("Изменить") }
                                    TextButton(onClick = { model.reorder(day, index, index - 1) }, enabled = !model.busy && index > 0) { Text("↑") }
                                    TextButton(onClick = { model.reorder(day, index, index + 1) }, enabled = !model.busy && index < day.array("template_exercises").lastIndex) { Text("↓") }
                                    TextButton(onClick = { deletePath = "/api/programs/template-exercises/${exercise.getInt("id")}/" }) { Text("Удалить") }
                                }
                            }
                        }
                    }
                    TextButton(onClick = { exerciseTemplate = day.getInt("id"); editExercise = JSONObject(); model.loadCatalog() }, enabled = !model.busy) { Text("+ Добавить упражнение") }
                }
                }
            }
        }
    }
    editFolder?.let { folder -> FolderDialog(folder, model) { editFolder = null } }
    editDay?.let { day -> DayDialog(day, model) { editDay = null } }
    editExercise?.let { exercise -> ExerciseDialog(exercise, exerciseTemplate, model) { editExercise = null } }
    deletePath?.let { path -> ConfirmDelete("элемент", { deletePath = null }) { model.delete(path) } }
    info?.let { ExerciseInfo(it, model) { info = null } }
    if (chat) ChatDialog(model) { chat = false }
}

@Composable fun FolderDialog(folder: JSONObject, model: AppModel, dismiss: () -> Unit) {
    var active by remember { mutableStateOf(folder.optBoolean("is_active", true)) }
    var deleting by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(folder.text("name")) }
    var comment by remember { mutableStateOf(folder.text("comment")) }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Программа") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }; Field("Название", name, { name = it }); Field("Комментарий", comment, { comment = it })
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Switch(active, { active = it }, enabled = !model.busy); Text(if (active) "Активна" else "Выключена") }
            if (folder.has("id")) TextButton(onClick = { deleting = true }, enabled = !model.busy) { Text("Удалить программу", color = MaterialTheme.colorScheme.error) }
        }
    }, confirmButton = { TextButton(onClick = {
        model.save("/api/programs/folders/", obj("name" to name.trim(), "comment" to comment, "is_active" to active), folder.opt("id"), dismiss)
    }, enabled = !model.busy && name.isNotBlank()) { Text("Сохранить") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Отмена") } })
    if (deleting) ConfirmDelete("программу", { deleting = false }) { model.delete("/api/programs/folders/${folder.getInt("id")}/"); dismiss() }

}

fun scheduleLabel(day: JSONObject): String {
    val config = day.optJSONObject("schedule_config") ?: JSONObject()
    val weekdays = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
    val days = config.optJSONArray("days_of_week") ?: JSONArray()
    val labels = (0 until days.length()).mapNotNull { weekdays.getOrNull(days.optInt(it)) }.joinToString(", ")
    return when (day.text("schedule_type")) {
        "weekly" -> "Каждую неделю: $labels"
        "biweekly" -> "Раз в ${config.optInt("week_interval", 2)} недель: $labels"
        "interval" -> "Каждые ${config.optInt("every_x_days", 2)} дней, с ${config.text("start_date")}"
        else -> "Даты: ${config.optJSONArray("specific_dates")?.join(", ").orEmpty().replace("\"", "") }"
    }
}

@Composable fun DayDialog(day: JSONObject, model: AppModel, dismiss: () -> Unit) {
    var name by remember { mutableStateOf(day.text("name")) }
    var comment by remember { mutableStateOf(day.text("comment")) }
    var type by remember { mutableStateOf(day.text("schedule_type", "weekly")) }
    val config = day.optJSONObject("schedule_config") ?: JSONObject()
    var selected by remember { mutableStateOf((config.optJSONArray("days_of_week") ?: JSONArray().put(LocalDate.now().dayOfWeek.value - 1)).let { a -> (0 until a.length()).map { a.getInt(it) }.toSet() }) }
    var start by remember { mutableStateOf(config.text("start_date", LocalDate.now().toString())) }
    var interval by remember { mutableStateOf(config.text(if (type == "biweekly") "week_interval" else "every_x_days", "2")) }
    var dates by remember { mutableStateOf(config.optJSONArray("specific_dates")?.join(", ")?.replace("\"", "").orEmpty()) }
    AlertDialog(onDismissRequest = dismiss, title = { Text("День тренировки") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Field("Название", name, { name = it }); Field("Комментарий", comment, { comment = it })
            Choices("Расписание", type, listOf("weekly" to "По неделям", "biweekly" to "Раз в N недель", "interval" to "Через X дней", "custom" to "Даты")) { type = it }
            if (type == "weekly" || type == "biweekly") {
                Row(Modifier.horizontalScroll(rememberScrollState())) { listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEachIndexed { i, label ->
                    FilterChip(i in selected, { selected = if (i in selected) selected - i else selected + i }, label = { Text(label) })
                } }
            }
            if (type == "biweekly" || type == "interval") { Field("Дата старта ГГГГ-ММ-ДД", start, { start = it }); Field("Интервал", interval, { interval = it }) }
            if (type == "custom") Field("Даты через запятую ГГГГ-ММ-ДД", dates, { dates = it })
        }
    }, confirmButton = { TextButton(onClick = {
        val schedule = try { scheduleConfig(type, selected, start, interval, dates) } catch (e: IllegalArgumentException) { model.error = e.message; return@TextButton }
        model.save("/api/programs/templates/", obj("folder" to day.getInt("folder"), "name" to name.trim(), "comment" to comment,
            "schedule_type" to type, "schedule_config" to schedule), day.opt("id"), dismiss)
    }, enabled = !model.busy && name.isNotBlank() && (type !in listOf("weekly", "biweekly") || selected.isNotEmpty())) { Text("Сохранить") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Отмена") } })
}

@Composable fun ExerciseDialog(exercise: JSONObject, template: Int, model: AppModel, dismiss: () -> Unit) {
    val initial = exercise.optJSONObject("exercise") ?: exercise.optJSONObject("custom_exercise")
    var source by remember { mutableStateOf(initial) }
    var custom by remember { mutableStateOf(exercise.optJSONObject("custom_exercise") != null) }
    var query by rememberSaveable { mutableStateOf("") }
    var makeCustom by remember { mutableStateOf(false) }
    var reps by remember { mutableStateOf(exercise.text("rep_override", initial?.text("default_reps", "10") ?: "10")) }
    var sets by remember { mutableStateOf(exercise.text("set_override", initial?.text("default_sets", "3") ?: "3")) }
    var weight by remember { mutableStateOf(exercise.text("weight_override", initial?.text("default_weight", "0") ?: "0")) }
    var time by remember { mutableStateOf(exercise.text("time_override", initial?.text("default_time", "30") ?: "30")) }
    var rest by remember { mutableStateOf(exercise.text("rest_override", initial?.text("default_rest", "60") ?: "60")) }
    var note by remember { mutableStateOf(exercise.text("note")) }
    var active by remember { mutableStateOf(exercise.optBoolean("is_active", true)) }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Упражнение") }, text = {
        Column(Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (source == null) {
                Field("Поиск в каталоге", query, { query = it })
                TextButton(onClick = { model.loadCatalog(query) }, enabled = !model.catalogLoading) { Text("Найти") }
                Box(Modifier.fillMaxWidth().height(3.dp)) { if (model.catalogLoading) LinearProgressIndicator(Modifier.fillMaxWidth()) }
                Choices("Каталог", if (custom) "custom" else "system", listOf("system" to "Общие", "custom" to "Мои")) { custom = it == "custom"; if (custom) model.loadCustomExercises() }
                TextButton(onClick = { makeCustom = true }) { Text("Создать своё упражнение") }
                if (!custom && model.catalog.size > 50) Text("Показаны первые 50 упражнений. Уточните поиск, чтобы найти нужное.")
                (if (custom) model.customExercises else model.catalog).take(50).forEach { candidate ->
                    TextButton(onClick = { source = candidate; reps = candidate.text("default_reps", "10"); sets = candidate.text("default_sets", "3"); weight = candidate.text("default_weight", "0"); time = candidate.text("default_time", "30"); rest = candidate.text("default_rest", "60") }) { Text(candidate.text("name")) }
                }
            } else {
                Text(source!!.text("name"), style = MaterialTheme.typography.titleMedium)
                if (!exercise.has("id")) TextButton(onClick = { source = null }) { Text("Выбрать другое") }
                Field("Подходы", sets, { sets = it }); Field("Повторы", reps, { reps = it })
                if (source!!.optBoolean("has_weight")) Field("Вес, кг", weight, { weight = it })
                if (source!!.optBoolean("has_time")) Field("Время, сек", time, { time = it })
                Field("Отдых, сек", rest, { rest = it }); Field("Заметка", note, { note = it })
                Row { Checkbox(active, { active = it }); Text("Активно", Modifier.padding(top = 12.dp)) }
            }
        }
    }, confirmButton = { TextButton(onClick = {
        val chosen = source ?: return@TextButton
        model.save("/api/programs/template-exercises/", obj("template" to template,
            (if (custom) "custom_exercise_id" else "exercise_id") to chosen.get("id"),
            "set_override" to sets.toIntOrNull(), "rep_override" to reps.toIntOrNull(),
            "weight_override" to weight.replace(',', '.').toDoubleOrNull(), "time_override" to time.toIntOrNull(),
            "rest_override" to rest.toIntOrNull(), "note" to note, "is_active" to active), exercise.opt("id"), dismiss)
    }, enabled = source != null && !model.busy && (sets.toIntOrNull() ?: 0) > 0) { Text("Сохранить") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Отмена") } })
    if (makeCustom) CustomExerciseDialog(model) { makeCustom = false }
}

@Composable fun CustomExerciseDialog(model: AppModel, dismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }; var description by remember { mutableStateOf("") }; var muscles by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf(true) }; var time by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Своё упражнение") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Field("Название", name, { name = it }); Field("Описание", description, { description = it }); Field("Мышцы", muscles, { muscles = it })
        Row { Checkbox(weight, { weight = it }); Text("С весом", Modifier.padding(top = 12.dp)) }; Row { Checkbox(time, { time = it }); Text("На время", Modifier.padding(top = 12.dp)) }
    } }, confirmButton = { TextButton(onClick = { model.run {
        val created = model.api.call("/api/exercises/custom/", "POST", obj("name" to name, "description" to description, "target_muscles" to muscles,
            "has_weight" to weight, "has_time" to time, "default_sets" to 3, "default_reps" to 10, "default_rest" to 60)) as JSONObject
        model.customExercises = listOf(created) + model.customExercises.filter { it.optInt("id") != created.optInt("id") }
        dismiss()
        model.customExercises = model.api.call("/api/exercises/custom/").rows()
    } }, enabled = name.isNotBlank() && !model.busy) { Text("Создать") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Отмена") } })
}

@Composable fun ExerciseInfo(source: JSONObject, model: AppModel, dismiss: () -> Unit) {
    var tab by remember { mutableStateOf("technique") }
    var detail by remember(source.text("id")) { mutableStateOf(source) }
    var loading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    LaunchedEffect(source.text("id"), retry) {
        loading = true; detailError = null
        try {
            val id = java.net.URLEncoder.encode(source.text("id"), "UTF-8")
            val path = if (source.opt("id") is String) "/api/exercises/$id/" else "/api/exercises/custom/$id/"
            detail = model.api.call(path) as JSONObject
        } catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; detailError = "Не удалось загрузить подробную технику" }
        finally { loading = false }
    }
    val galleryScope = rememberCoroutineScope()
    DetailSurface(source.text("name"), tag = "exercise-info-sheet", dismiss = dismiss) {
        DetailTabs(tab, listOf("technique" to "Описание", "statistics" to "Статистика")) { tab = it }
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            if (tab == "statistics") ExerciseStatistics(source, model) else {
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                detailError?.let { Text(it, color = MaterialTheme.colorScheme.error); TextButton(onClick = { retry++ }) { Text("Повторить") } }
                if (detail.text("difficulty").isNotBlank()) Text("Сложность: ${detail.text("difficulty")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (detail.text("target_muscles").isNotBlank()) Text("Мышцы: ${detail.text("target_muscles")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(detail.text("description").ifBlank { "Описание упражнения пока не добавлено." }, style = MaterialTheme.typography.bodyMedium)
                val images = detail.array("images")
                if (images.isNotEmpty()) {
                    val pager = rememberPagerState(pageCount = { images.size })
                    Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Box(Modifier.fillMaxWidth().height(260.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize().testTag("exercise-image-pager")) { index ->
                                val url = exerciseImageUrl(images[index].text("path"))
                                val localImage by produceState<Any?>(null, url, model.token) { value = model.imageOnDevice(url) }
                                AsyncImage(localImage, "Техника упражнения, шаг ${index + 1}", Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                            }
                            if (images.size > 1) Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                FilledTonalIconButton(onClick = { galleryScope.launch { pager.animateScrollToPage((pager.currentPage - 1 + images.size) % images.size) } }) { Icon(Icons.Outlined.ChevronLeft, "Предыдущее изображение") }
                                FilledTonalIconButton(onClick = { galleryScope.launch { pager.animateScrollToPage((pager.currentPage + 1) % images.size) } }) { Icon(Icons.Outlined.ChevronRight, "Следующее изображение") }
                            }
                        }
                    }
                    Text("${pager.currentPage + 1} / ${images.size}", Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (detail.text("common_errors").isNotBlank()) {
                    Text("Частые ошибки", style = MaterialTheme.typography.titleSmall)
                    Text(detail.text("common_errors"), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
