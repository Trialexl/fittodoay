package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable fun PlaylistSheet(model: AppModel, dismiss: () -> Unit) {
    var adding by remember { mutableStateOf(false) }
    DetailSurface("Плейлист", "${model.tracks.size} треков и станций", "playlist-sheet", dismiss) {
        if (!adding) PlaylistContent(model, scroll = true, modifier = Modifier.weight(1f, fill = false))
        if (adding) {
            Text("Выберите один или несколько MP3. Музыка останется доступна в вашем плейлисте.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            model.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            model.notice?.takeIf { it.startsWith("Файл загружен") }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
            UploadButton(model, "Загрузить MP3", "audio/*", "/api/workouts/music/tracks/upload/", "file", 130)
            MusicBatchUploadButton(model)
        }
        TextButton(onClick = { adding = !adding }, modifier = Modifier.fillMaxWidth()) {
            Icon(if (adding) Icons.Outlined.ExpandLess else Icons.Outlined.FileUpload, null, Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)); Text(if (adding) "Скрыть загрузку" else "Добавить музыку")
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun PlaylistContent(model: AppModel, modifier: Modifier = Modifier, scroll: Boolean = false) {
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf(model.preferences.text("music_group_by", "folder")) }
    var section by remember { mutableStateOf("tracks") }
    var source by remember { mutableStateOf("all") }
    var deleting by remember { mutableStateOf<Int?>(null) }
    val audio = model.audio
    Column(modifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp),
            placeholder = { Text("Поиск по треку, станции, альбому", style = MaterialTheme.typography.bodySmall) },
            leadingIcon = { Icon(Icons.Outlined.Search, null, Modifier.size(18.dp)) })
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CompactSelector("Группировка", group, listOf("none" to "Все треки", "folder" to "По папкам", "artist" to "Исполнитель", "album" to "Альбом")) {
                group = it; model.preferences(obj("music_group_by" to it))
            }
            CompactSelector("Источник", source, listOf("all" to "Все источники", "file" to "Файлы", "stream" to "Радио")) { source = it }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SegmentedOptions(section, listOf("tracks" to "Треки", "queue" to "Очередь · ${audio.queue.size}")) { section = it } }
            IconToggleButton(audio.shuffle, { audio.shuffle = it }, Modifier.testTag("music-shuffle")) { Icon(Icons.Outlined.Shuffle, "Перемешивать", Modifier.size(19.dp), tint = if (audio.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        audio.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        val listModifier = if (scroll) Modifier.weight(1f, fill = false).heightIn(max = 420.dp).verticalScroll(rememberScrollState()) else Modifier
        Column(listModifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (section == "queue") {
                if (audio.queue.isEmpty()) PlaylistEmpty("Очередь пока пуста", "Добавьте трек через меню ⋯")
                audio.queue.forEachIndexed { index, item ->
                    var menu by remember { mutableStateOf(false) }
                    Row(Modifier.fillMaxWidth().testTag("queue-$index").padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${index + 1}".padStart(2, '0'), Modifier.width(30.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(item.second, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelMedium)
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "Действия в очереди ${index + 1}") }
                            DropdownMenu(menu, { menu = false }) {
                                DropdownMenuItem(text = { Text("Выше") }, enabled = index > 0, onClick = { menu = false; audio.move(index, index - 1) })
                                DropdownMenuItem(text = { Text("Ниже") }, enabled = index < audio.queue.lastIndex, onClick = { menu = false; audio.move(index, index + 1) })
                                DropdownMenuItem(text = { Text("Убрать") }, onClick = { menu = false; audio.remove(index) })
                            }
                        }
                    }
                }
            } else {
                val shown = model.tracks.filter { (source == "all" || it.text("source_type") == source) &&
                    listOf("title", "name", "artist", "album").any { key -> it.text(key).contains(query.trim(), ignoreCase = true) } }
                if (shown.isEmpty()) PlaylistEmpty("Ничего не найдено", "Попробуйте другое название или источник")
                shown.groupBy { track -> when (group) {
                    "folder" -> if (track.text("source_type") == "stream") "Радио · ${if (track.text("stream_category") == "relax") "Релакс" else "Тренировка"}" else track.text("filename").substringBeforeLast('/', "Без папки").replace(Regex("^user_[0-9]+$"), "Мои треки").replace(Regex("^system$"), "Системные")
                    "artist", "album" -> track.text(group).ifBlank { "Без группы" }
                    else -> "Все треки"
                } }.forEach { (title, tracks) ->
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(tracks.size.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    tracks.forEach { track ->
                        var menu by remember { mutableStateOf(false) }
                        val id = track.getInt("id"); val selected = audio.trackId == id
                        val name = track.text("title", track.text("name"))
                        Surface(Modifier.fillMaxWidth().testTag("music-track-$id"), shape = RoundedCornerShape(12.dp),
                            color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .08f) else MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .45f) else MaterialTheme.colorScheme.outlineVariant)) {
                            Row(Modifier.padding(start = 12.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                Row(Modifier.weight(1f).clickable { if (selected) audio.toggle() else audio.play(track, shown, model.token) }.padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Icon(if (selected && audio.playing) Icons.Outlined.Pause else if (track.text("source_type") == "stream") Icons.Outlined.Radio else Icons.Outlined.MusicNote, null,
                                        Modifier.size(18.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text(name, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                                        track.text("artist").takeIf(String::isNotBlank)?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                                    }
                                }
                                if (track.text("source_type") == "stream") Text("LIVE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                Box {
                                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "Действия с треком: $name", Modifier.size(18.dp)) }
                                    DropdownMenu(menu, { menu = false }) {
                                        DropdownMenuItem(text = { Text("В очередь") }, leadingIcon = { Icon(Icons.Outlined.PlaylistAdd, null) }, onClick = { menu = false; audio.enqueue(track) })
                                        if (track.optBoolean("is_mine") && track.text("source_type") != "stream") DropdownMenuItem(text = { Text("Удалить") }, onClick = { menu = false; deleting = id })
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (audio.trackId != null) {
            Text(audio.title, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (audio.durationMs > 0) {
                var seek by remember { mutableStateOf<Float?>(null) }
                Slider(seek ?: (audio.positionMs.toFloat() / audio.durationMs).coerceIn(0f, 1f), { seek = it }, Modifier.testTag("music-seek"),
                    onValueChangeFinished = { audio.seek(((seek ?: 0f) * audio.durationMs).toLong()); seek = null })
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.VolumeUp, "Громкость", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Slider(audio.volume, { audio.volume = it }, Modifier.weight(1f))
            }
        }
    }
    deleting?.let { id -> ConfirmDelete("трек", { deleting = null }) { model.delete("/api/workouts/music/tracks/$id/") } }
}

@Composable private fun PlaylistEmpty(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.QueueMusic, null, Modifier.size(28.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleSmall); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
