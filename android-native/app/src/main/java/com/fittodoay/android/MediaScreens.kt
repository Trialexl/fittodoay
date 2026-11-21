package com.fittodoay.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

private suspend fun prepareUpload(context: Context, uri: Uri, maxMb: Int): Pair<String, File> = withContext(Dispatchers.IO) {
    var name = "upload"
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            name = cursor.getString(0) ?: name
            if (!cursor.isNull(1)) require(cursor.getLong(1) <= maxMb * 1024L * 1024L) { "Максимальный размер файла: $maxMb МБ" }
        }
    }
    val file = File.createTempFile("upload-", ".tmp", context.cacheDir)
    try {
        requireNotNull(context.contentResolver.openInputStream(uri)).use { input -> file.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024); var total = 0L
            while (true) { val count = input.read(buffer); if (count < 0) break; total += count; require(total <= maxMb * 1024L * 1024L) { "Файл слишком большой" }; output.write(buffer, 0, count) }
        } }
        name to file
    } catch (error: Exception) { file.delete(); throw error }
}

@Composable fun UploadButton(model: AppModel, label: String, mime: String, path: String, field: String, maxMb: Int) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var preparing by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            preparing = true
            try {
                val (name, file) = prepareUpload(context, uri, maxMb)
                if (model.busy) { file.delete(); model.error = "Дождитесь завершения текущего запроса и повторите загрузку" }
                else model.uploaded(path, field, name, context.contentResolver.getType(uri) ?: "application/octet-stream", file)
            } catch (e: Exception) { model.error = e.message ?: "Не удалось открыть файл" }
            finally { preparing = false }
        }
    }
    Action(if (preparing) "Подготовка файла…" else label, !model.busy && !preparing) { launcher.launch(arrayOf(mime)) }
}

@Composable fun MusicBatchUploadButton(model: AppModel) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    var preparing by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) scope.launch {
            val files = mutableListOf<UploadFile>(); preparing = true
            try {
                for (uri in uris) {
                    val (name, file) = prepareUpload(context, uri, 130)
                    files += UploadFile(name, context.contentResolver.getType(uri) ?: "audio/mpeg", file)
                }
                if (model.busy) error("Дождитесь завершения текущего запроса и повторите загрузку")
                model.uploadedMusicBatch(files.toList()); files.clear()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                model.error = e.message ?: "Не удалось открыть файлы"
            } finally { preparing = false; files.forEach { it.file.delete() } }
        }
    }
    OutlinedButton(onClick = { launcher.launch(arrayOf("audio/*")) }, enabled = !model.busy && !preparing, modifier = Modifier.fillMaxWidth()) {
        Text(if (preparing) "Подготовка файлов…" else "Загрузить несколько MP3")
    }
}

@Composable fun TechniqueScreen(model: AppModel) {
    var video by remember { mutableStateOf<File?>(null) }
    var selected by remember { mutableStateOf<JSONObject?>(null) }
    var delete by remember { mutableStateOf<Int?>(null) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(model.reviews.any { it.text("status") == "processing" }) {
        while (model.reviews.any { it.text("status") == "processing" }) { delay(5000); if (!model.busy) model.refresh() }
    }
    Page {
        ScreenHeading("AI Technique Check", "Проверка техники", "Загрузите короткое видео подхода. Система попробует определить упражнение и разобрать технику по кадрам.")
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp), color = androidx.compose.ui.graphics.Color(0xfffffbea), border = BorderStroke(1.dp, androidx.compose.ui.graphics.Color(0xfff3e7ae))) {
            Text("Фича не заменяет тренера или врача. При боли, травмах и сомнениях лучше остановить подход и обратиться к специалисту.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = androidx.compose.ui.graphics.Color(0xff856345))
        }
        TechniqueUpload(model)
        if (model.reviews.isEmpty() && !model.busy) Panel("Последние проверки") { Text("Пока нет загруженных видео.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        model.reviews.forEach { review ->
            Panel(review.optJSONObject("exercise")?.text("name") ?: review.text("detected_exercise_name").ifBlank { review.text("video_filename") }, Modifier.testTag("technique-review-${review.getInt("id")}")) {
                Text(when (review.text("status")) { "processing" -> "Анализируется…"; "completed" -> "Анализ завершён"; "needs_confirmation" -> "Уточните упражнение"; else -> "Не удалось завершить анализ" })
                if (!review.isNull("score")) Text("Оценка: ${review.text("score")}", style = MaterialTheme.typography.headlineSmall)
                if (review.text("summary").isNotBlank()) Text(review.text("summary"))
                Row { TextButton(onClick = { selected = review }) { Text("Подробнее") }; TextButton(onClick = { delete = review.getInt("id") }, enabled = !model.busy) { Text("Удалить") } }
                if (review.text("video_url").isNotBlank() || model.localReviewVideo(review.getInt("id")) != null) {
                    TextButton(onClick = { model.run { video = model.localReviewVideo(review.getInt("id")) ?: model.reviewVideo(review) } }, enabled = !model.busy) { Text("Смотреть видео") }
                }
                if (review.text("status") == "needs_confirmation") {
                    review.optJSONObject("result_json")?.optJSONObject("detected_exercise")?.array("alternatives")?.filter { it.text("catalog_exercise_id").isNotBlank() }?.forEach { alternative ->
                        TextButton(onClick = { model.run {
                            model.api.call("/api/technique-reviews/${review.getInt("id")}/confirm-exercise/", "POST", obj("exercise_id" to alternative.get("catalog_exercise_id")))
                            model.reviews = model.api.all("/api/technique-reviews/").rows()
                        } }, enabled = !model.busy) { Text(alternative.text("name")) }
                    }
                    Field("Какое упражнение на видео?", query, { query = it })
                    TextButton(onClick = { model.loadCatalog(query) }, enabled = !model.busy) { Text("Найти в каталоге") }
                    model.catalog.take(15).forEach { exercise -> TextButton(onClick = { model.run {
                        model.api.call("/api/technique-reviews/${review.getInt("id")}/confirm-exercise/", "POST", obj("exercise_id" to exercise.get("id")))
                        model.reviews = model.api.all("/api/technique-reviews/").rows()
                    } }, enabled = !model.busy) { Text(exercise.text("name")) } }
                }
            }
        }
    }
    video?.let { file ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { video = null }) {
            Surface {
                Column(Modifier.padding(12.dp)) {
                    LocalTechniqueVideo(file)

                    TextButton(onClick = { video = null }) { Text("Закрыть видео") }
                }
            }
        }
    }
    delete?.let { id -> ConfirmDelete("проверку", { delete = null }) { model.delete("/api/technique-reviews/$id/") } }
    selected?.let { review -> AlertDialog(onDismissRequest = { selected = null }, title = { Text("Результат проверки") }, text = {
        Column(Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!review.isNull("detected_exercise_confidence")) Text("Уверенность: ${"%.0f".format(review.optDouble("detected_exercise_confidence") * 100)}%")
            Text(review.text("summary")); review.optJSONObject("result_json")?.let { TechniqueResult(it) }
            if (review.text("status") == "failed" && review.text("summary").isBlank()) Text("Анализ недоступен. Попробуйте другое видео или повторите позже.")
        }
    }, confirmButton = { TextButton(onClick = { selected = null }) { Text("Закрыть") } }) }
}

@Composable private fun TechniqueUpload(model: AppModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<UploadFile?>(null) }
    var preparing by remember { mutableStateOf(false) }
    val current by rememberUpdatedState(selected)
    DisposableEffect(Unit) { onDispose { current?.file?.delete() } }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            preparing = true
            try {
                val (name, file) = prepareUpload(context, uri, 80)
                selected?.file?.delete()
                selected = UploadFile(name, context.contentResolver.getType(uri) ?: "video/mp4", file)
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                model.error = error.message ?: "Не удалось открыть видео"
            } finally { preparing = false }
        }
    }
    Panel("Новое видео") {
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Выберите видео подхода", style = MaterialTheme.typography.titleSmall)
                Text("MP4, MOV, WEBM или M4V. Лучше 5–15 секунд, всё тело в кадре. До 80 МБ.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(onClick = { picker.launch(arrayOf("video/*")) }, enabled = !model.busy && !preparing,
                        colors = ButtonDefaults.textButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) { Text(if (preparing) "Подготовка…" else "Выбрать видео") }
                    Text(selected?.name ?: "Файл не выбран", style = MaterialTheme.typography.bodySmall, maxLines = 2, modifier = Modifier.weight(1f))
                }
            }
        }
        Action("Загрузить и разобрать", selected != null && !model.busy && !preparing) {
            selected?.let { upload ->
                selected = null
                model.uploaded("/api/technique-reviews/", "video_file", upload.name, upload.mime, upload.file)
            }
        }
    }
}

@Composable private fun TechniqueResult(value: JSONObject) {
    value.array("issues").takeIf { it.isNotEmpty() }?.let { issues ->
        Text("Что исправить", style = MaterialTheme.typography.titleMedium)
        issues.forEach { issue ->
            Text(issue.text("title", "Замечание по технике"), style = MaterialTheme.typography.titleSmall)
            val severity = mapOf("low" to "Низкая", "medium" to "Средняя", "high" to "Высокая")[issue.text("severity")]
            severity?.let { Text("Важность: $it") }
            if (issue.text("evidence").isNotBlank()) Text(issue.text("evidence"))
            if (issue.text("advice").isNotBlank()) Text(issue.text("advice"))
        }
    }
    listOf("positive_notes" to "Что получилось хорошо", "next_set_focus" to "Фокус на следующий подход", "camera_feedback" to "Качество видео").forEach { (key, title) ->
        value.optJSONArray(key)?.takeIf { it.length() > 0 }?.let { items ->
            Text(title, style = MaterialTheme.typography.titleMedium)
            repeat(items.length()) { Text("• ${items.optString(it)}") }
        }
    }
}

@Composable fun SettingsScreen(model: AppModel) {
    var goal by remember(model.profile) { mutableStateOf(model.profile.text("goal", "strength")) }
    var gender by remember(model.profile) { mutableStateOf(model.profile.text("gender", "male")) }
    var level by remember(model.profile) { mutableStateOf(model.profile.text("level", "beginner")) }
    var age by remember(model.profile) { mutableStateOf(model.profile.text("age")) }
    var weight by remember(model.profile) { mutableStateOf(model.profile.text("weight_kg")) }
    var height by remember(model.profile) { mutableStateOf(model.profile.text("height_cm")) }
    var equipment by remember(model.profile) { mutableStateOf(model.profile.text("equipment")) }
    var health by remember(model.profile) { mutableStateOf(model.profile.text("health_limitations")) }
    var schedule by remember(model.profile) { mutableStateOf(model.profile.text("preferred_schedule_notes")) }
    var feedback by remember { mutableStateOf("") }
    var customAccent by remember(model.preferences.text("accent_color")) { mutableStateOf(model.preferences.text("accent_color", "#a855f7")) }
    Page {
        Panel("Оформление") { AppearanceControls(model) }
        Panel("Ваш профиль") {
            Choices("Цель", goal, goals) { goal = it }; Choices("Пол", gender, genders) { gender = it }; Choices("Опыт", level, levels) { level = it }
            Field("Возраст", age, { age = it }); Field("Вес, кг", weight, { weight = it }); Field("Рост, см", height, { height = it })
            Field("Оборудование", equipment, { equipment = it }); Field("Ограничения здоровья", health, { health = it }); Field("Пожелания к расписанию", schedule, { schedule = it })
            Action("Сохранить профиль", !model.busy) { model.run {
                model.profile = model.api.call("/api/profile/", "PATCH", obj("goal" to goal, "gender" to gender, "level" to level, "age" to age.toIntOrNull(), "weight_kg" to weight.replace(',', '.').toDoubleOrNull(), "height_cm" to height.toDoubleOrNull(), "equipment" to equipment, "health_limitations" to health, "preferred_schedule_notes" to schedule)) as JSONObject
                model.notice = "Профиль сохранён"
            } }
        }
        LocalDataStatus(model)
        MusicPanel(model)
        TimerPermissionsPanel()
        McpPanel()
        Panel("Обратная связь") {
            OutlinedTextField(feedback, { feedback = it }, Modifier.fillMaxWidth(), label = { Text("Сообщение") }, minLines = 3)
            Action("Отправить", !model.busy && feedback.isNotBlank()) { model.run { model.api.call("/api/feedback/", "POST", obj("message" to feedback)); feedback = ""; model.notice = "Сообщение отправлено" } }
        }
        Text("Сервер: ${BuildConfig.SERVER_URL}", style = MaterialTheme.typography.labelSmall)
        OutlinedButton(onClick = model::logout, Modifier.fillMaxWidth(), enabled = !model.busy) { Text("Выйти") }
    }
}

@Composable private fun MusicPanel(model: AppModel) {
    Panel("Музыка") {
        UploadButton(model, "Загрузить MP3", "audio/*", "/api/workouts/music/tracks/upload/", "file", 130)
        MusicBatchUploadButton(model)
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        PlaylistContent(model, scroll = true, modifier = Modifier.height(520.dp))
    }
}
