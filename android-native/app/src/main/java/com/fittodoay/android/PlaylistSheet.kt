package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@OptIn(ExperimentalLayoutApi::class)
@Composable fun PlaylistSheet(model: AppModel, dismiss: () -> Unit) {
    var adding by remember { mutableStateOf(false) }
    DetailSurface("Плейлист", tag = "playlist-sheet", dismiss = dismiss, compact = true) {
        if (!adding) PlaylistContent(model, scroll = true, modifier = Modifier.weight(1f))
        if (adding) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Один или несколько MP3", style = MaterialTheme.typography.titleSmall)
                Text("Выбранные файлы появятся в вашей библиотеке.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                model.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                model.notice?.takeIf { it.startsWith("Файл загружен") }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                UploadButton(model, "Загрузить MP3", "audio/*", "/api/workouts/music/tracks/upload/", "file", 130)
                MusicBatchUploadButton(model)
            }
        }
        if (adding || !WindowInsets.isImeVisible) TextButton(onClick = { adding = !adding }, modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp), contentPadding = PaddingValues(4.dp)) {
            Icon(if (adding) Icons.Outlined.ExpandLess else Icons.Outlined.FileUpload, null, Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp)); Text(if (adding) "Скрыть загрузку" else "Добавить музыку", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable fun PlaylistContent(model: AppModel, modifier: Modifier = Modifier, scroll: Boolean = false) {
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf(model.preferences.text("music_group_by", "folder")) }
    var section by remember { mutableStateOf("tracks") }
    var source by remember { mutableStateOf("all") }
    var deleting by remember { mutableStateOf<Int?>(null) }
    var volumeOpen by remember { mutableStateOf(false) }
    val audio = model.audio
    val searching = WindowInsets.isImeVisible
    val listState = rememberLazyListState()
    val groupHeaderSpace = with(androidx.compose.ui.platform.LocalDensity.current) { 48.dp.roundToPx() }
    val shown = model.tracks.filter { (source == "all" || it.text("source_type") == source) &&
        listOf("title", "name", "artist", "album").any { key -> it.text(key).contains(query.trim(), ignoreCase = true) } }
    val groups = shown.groupBy { track -> when (group) {
        "folder" -> if (track.text("source_type") == "stream") "Радио · ${if (track.text("stream_category") == "relax") "Релакс" else "Тренировка"}" else track.text("filename").substringBeforeLast('/', "Без папки").replace(Regex("^user_[0-9]+$"), "Мои треки").replace(Regex("^system$"), "Системные")
        "artist", "album" -> track.text(group).ifBlank { "Без группы" }
        else -> "Все треки"
    } }
    LaunchedEffect(group, source, query, section, audio.trackId, audio.queueIndex, groupHeaderSpace) {
        if (scroll) {
            var target = 0
            if (section == "queue") target = (audio.queueIndex + 1).coerceAtLeast(0)
            else {
                var offset = 0
                groups.values.forEach { tracks ->
                    val index = tracks.indexOfFirst { it.optInt("id") == audio.trackId }
                    if (index >= 0) target = offset + index + 1
                    offset += tracks.size + 1
                }
            }
            listState.scrollToItem(target, scrollOffset = if (section == "tracks" && target > 0) -groupHeaderSpace else 0)
        }
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Surface(shape = RoundedCornerShape(10.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surface) {
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(start = 10.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Search, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                BasicTextField(query, { query = it; section = "tracks" }, Modifier.weight(1f).semantics { contentDescription = "Поиск музыки" }, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface), cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    decorationBox = { field -> if (query.isEmpty()) Text("Поиск трека, станции, альбома", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant); field() })
                if (query.isNotEmpty()) IconButton(onClick = { query = "" }, Modifier.size(36.dp)) { Icon(Icons.Outlined.Close, "Очистить поиск", Modifier.size(16.dp)) }
            }
        }
        if (!searching) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            CompactSelector("Группировка", group, listOf("none" to "Все треки", "folder" to "По папкам", "artist" to "Исполнитель", "album" to "Альбом")) {
                group = it; model.preferences(obj("music_group_by" to it))
            }
            CompactSelector("Источник", source, listOf("all" to "Все источники", "file" to "Файлы", "stream" to "Радио")) { source = it }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("tracks" to "Треки", "queue" to "Очередь · ${audio.queue.size}").forEach { (id, title) ->
                    TextButton(onClick = { section = id }, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp), modifier = Modifier.semantics { selected = section == id; role = Role.Tab },
                        colors = ButtonDefaults.textButtonColors(contentColor = if (section == id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)) { Text(title, style = MaterialTheme.typography.labelMedium) }
                }
            }
            IconToggleButton(audio.shuffle, { audio.shuffle = it }, Modifier.size(40.dp).testTag("music-shuffle")) { Icon(Icons.Outlined.Shuffle, "Перемешивать", Modifier.size(18.dp)) }
            Box {
                IconButton(onClick = { volumeOpen = true }, Modifier.size(40.dp)) { Icon(Icons.Outlined.VolumeUp, "Громкость", Modifier.size(18.dp)) }
                DropdownMenu(volumeOpen, { volumeOpen = false }) {
                    Text("Громкость", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall)
                    Slider(audio.volume, { audio.volume = it }, Modifier.width(210.dp).padding(horizontal = 12.dp).semantics { contentDescription = "Громкость музыки" })
                }
            }
        }
        }
        audio.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        model.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        val trackRow: @Composable (JSONObject) -> Unit = { track -> MusicTrackRow(model, track, shown) { deleting = it } }
        val queueRow: @Composable (Int) -> Unit = { index -> QueueTrackRow(audio, index) }
        if (scroll) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("playlist-list"), state = listState, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (section == "queue") {
                    if (audio.queue.isEmpty()) item { PlaylistEmpty("Очередь пока пуста", "Добавьте трек через меню ⋯") }
                    else item { TextButton(onClick = audio::clearQueue, contentPadding = PaddingValues(4.dp)) { Text("Очистить очередь", style = MaterialTheme.typography.labelSmall) } }
                    items(audio.queue.size) { queueRow(it) }
                } else {
                    if (shown.isEmpty()) item { PlaylistEmpty("Ничего не найдено", "Попробуйте другое название или источник") }
                    groups.forEach { (title, tracks) ->
                        stickyHeader(key = "group:$title") { MusicGroupHeading(title, tracks.size) }
                        items(tracks, key = { it.getInt("id") }) { trackRow(it) }
                    }
                }
            }
        } else Column(Modifier.fillMaxWidth().testTag("playlist-list"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (section == "queue") {
                if (audio.queue.isEmpty()) PlaylistEmpty("Очередь пока пуста", "Добавьте трек через меню ⋯")
                else TextButton(onClick = audio::clearQueue) { Text("Очистить очередь") }
                audio.queue.indices.forEach { queueRow(it) }
            } else {
                if (shown.isEmpty()) PlaylistEmpty("Ничего не найдено", "Попробуйте другое название или источник")
                groups.forEach { (title, tracks) -> MusicGroupHeading(title, tracks.size); tracks.forEach { trackRow(it) } }
            }
        }
        if (audio.trackId != null) PlaylistTransport(audio, compact = searching)
    }
    deleting?.let { id -> ConfirmDelete("трек", { deleting = null }) { deleting = null; model.delete("/api/workouts/music/tracks/$id/") } }
}

@Composable private fun MusicGroupHeading(title: String, count: Int) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 5.dp, start = 2.dp, end = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title.uppercase(), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(count.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable private fun MusicTrackRow(model: AppModel, track: JSONObject, tracks: List<JSONObject>, delete: (Int) -> Unit) {
    var menu by remember(track.optInt("id")) { mutableStateOf(false) }
    val audio = model.audio; val id = track.getInt("id"); val selected = audio.trackId == id
    val name = track.text("title", track.text("name")); val artist = track.text("artist")
    Surface(Modifier.fillMaxWidth().testTag("music-track-$id"), shape = RoundedCornerShape(10.dp),
        color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .09f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .5f) else MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.heightIn(min = if (artist.isBlank()) 48.dp else 54.dp).padding(start = 10.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable { if (selected) audio.toggle() else audio.play(track, tracks, model.token) }.padding(vertical = 7.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(name, style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 18.sp, fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                if (artist.isNotBlank()) Text(artist, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (selected) Icon(if (audio.playing) Icons.Outlined.GraphicEq else Icons.Outlined.Check, if (audio.playing) "Играет" else "Выбран", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
            else if (track.text("source_type") == "stream") Text("LIVE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Box {
                IconButton(onClick = { menu = true }, Modifier.size(40.dp)) { Icon(Icons.Outlined.MoreHoriz, "Действия с треком: $name", Modifier.size(18.dp)) }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Text("Играть") }, leadingIcon = { Icon(Icons.Outlined.PlayArrow, null) }, onClick = { menu = false; audio.play(track, tracks, model.token) })
                    DropdownMenuItem(text = { Text("Следующим") }, leadingIcon = { Icon(Icons.Outlined.SkipNext, null) }, onClick = { menu = false; audio.enqueue(track, next = true) })
                    DropdownMenuItem(text = { Text("В очередь") }, leadingIcon = { Icon(Icons.Outlined.PlaylistAdd, null) }, onClick = { menu = false; audio.enqueue(track) })
                    if (track.optBoolean("is_mine") && track.text("source_type") != "stream") DropdownMenuItem(text = { Text("Удалить") }, onClick = { menu = false; delete(id) })
                }
            }
        }
    }
}

@Composable private fun QueueTrackRow(audio: AudioController, index: Int) {
    val item = audio.queue.getOrNull(index) ?: return
    var menu by remember { mutableStateOf(false) }
    val active = audio.queueIndex == index
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("queue-$index").semantics { selected = active }, verticalAlignment = Alignment.CenterVertically) {
        Text((index + 1).toString().padStart(2, '0'), Modifier.width(30.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(item.second, Modifier.weight(1f).clickable { audio.playQueued(index) }.padding(vertical = 12.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        Box {
            IconButton(onClick = { menu = true }, Modifier.size(40.dp)) { Icon(Icons.Outlined.MoreHoriz, "Действия в очереди ${index + 1}", Modifier.size(18.dp)) }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Text("Играть") }, onClick = { menu = false; audio.playQueued(index) })
                DropdownMenuItem(text = { Text("Выше") }, enabled = index > 0, onClick = { menu = false; audio.move(index, index - 1) })
                DropdownMenuItem(text = { Text("Ниже") }, enabled = index < audio.queue.lastIndex, onClick = { menu = false; audio.move(index, index + 1) })
                DropdownMenuItem(text = { Text("Убрать") }, onClick = { menu = false; audio.remove(index) })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun PlaylistTransport(audio: AudioController, compact: Boolean = false) {
    Column(Modifier.fillMaxWidth().testTag("playlist-transport"), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(audio.title, Modifier.weight(1f).padding(end = 6.dp), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            IconButton(onClick = { audio.next(-1) }, Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipPrevious, "Предыдущий трек", Modifier.size(20.dp)) }
            IconButton(onClick = audio::toggle, Modifier.size(44.dp)) { Icon(if (audio.playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, "Пауза или воспроизведение в плейлисте", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary) }
            IconButton(onClick = { audio.next() }, Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipNext, "Следующий трек в плейлисте", Modifier.size(20.dp)) }
        }
        if (audio.durationMs > 0 && !compact) {
            var seek by remember { mutableStateOf<Float?>(null) }
            Slider(seek ?: (audio.positionMs.toFloat() / audio.durationMs).coerceIn(0f, 1f), { seek = it }, Modifier.fillMaxWidth().height(24.dp).testTag("music-seek"),
                onValueChangeFinished = { audio.seek(((seek ?: 0f) * audio.durationMs).toLong()); seek = null },
                thumb = { Box(Modifier.size(12.dp).background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape)) },
                track = { state ->
                    val trackColor = MaterialTheme.colorScheme.outlineVariant; val accent = MaterialTheme.colorScheme.primary
                    Canvas(Modifier.fillMaxWidth().height(3.dp)) {
                        val start = androidx.compose.ui.geometry.Offset(0f, size.height / 2)
                        drawLine(trackColor, start, androidx.compose.ui.geometry.Offset(size.width, size.height / 2), strokeWidth = size.height, cap = androidx.compose.ui.graphics.StrokeCap.Round)
                        drawLine(accent, start, androidx.compose.ui.geometry.Offset(size.width * state.value, size.height / 2), strokeWidth = size.height, cap = androidx.compose.ui.graphics.StrokeCap.Round)
                    }
                })
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(musicTime(audio.positionMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(musicTime(audio.durationMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
private fun musicTime(ms: Long) = "${ms / 60000}:${((ms / 1000) % 60).toString().padStart(2, '0')}"

@Composable private fun PlaylistEmpty(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Outlined.QueueMusic, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
