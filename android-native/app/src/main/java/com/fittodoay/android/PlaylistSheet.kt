package com.fittodoay.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalLayoutApi::class)
@Composable fun PlaylistSheet(model: AppModel, dismiss: () -> Unit) {
    var adding by rememberSaveable { mutableStateOf(false) }
    DetailSurface("Добавить музыку", tag = "playlist-sheet", dismiss = dismiss, compact = true, showHeader = adding) {
        if (!adding) PlaylistContent(model, scroll = true, modifier = Modifier.weight(1f), addMusic = { adding = true }, close = dismiss)
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
        if (adding) TextButton(onClick = { adding = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp), contentPadding = PaddingValues(4.dp)) {
            Icon(Icons.Outlined.ArrowBack, null, Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp)); Text("К трекам", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable fun PlaylistContent(model: AppModel, modifier: Modifier = Modifier, scroll: Boolean = false, addMusic: (() -> Unit)? = null, close: (() -> Unit)? = null) {
    var query by rememberSaveable { mutableStateOf("") }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    // Preferences and tracks can arrive after this sheet's first composition.
    var groupChoice by rememberSaveable { mutableStateOf<String?>(null) }
    val group = groupChoice ?: musicGrouping(model.preferences.text("music_group_by"))
    var section by rememberSaveable { mutableStateOf("tracks") }
    var source by rememberSaveable { mutableStateOf("all") }
    var deleting by remember { mutableStateOf<Int?>(null) }
    var filtersOpen by remember { mutableStateOf(false) }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val searchFocus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(searchOpen) { if (searchOpen) { searchFocus.requestFocus(); keyboard?.show() } }
    val audio = model.audio
    val searching = WindowInsets.isImeVisible
    val listState = rememberLazyListState()
    val initialHeaderSpace = with(androidx.compose.ui.platform.LocalDensity.current) { 44.dp.roundToPx() }
    var groupHeaderSpace by remember(initialHeaderSpace) { mutableIntStateOf(initialHeaderSpace) }
    val shown = model.tracks.filter { (source == "all" || it.text("source_type") == source) &&
        listOf("title", "name", "artist", "album", "filename").any { key -> it.text(key).contains(query.trim(), ignoreCase = true) } }
    val groups = shown.groupBy { track -> when (group) {
        "folder" -> musicFolderLabel(track)
        "artist", "album" -> track.text(group).ifBlank { "Без группы" }
        else -> "Все треки"
    } }
    val expansion = remember(group, source, query) { mutableStateMapOf<String, Boolean>() }
    fun expanded(title: String, tracks: List<JSONObject>) = query.isNotBlank() || group == "none" ||
        (expansion[title] ?: (tracks.any { it.optInt("id") == audio.trackId } || audio.trackId == null && title == groups.keys.firstOrNull()))
    val catalogKey = groups.map { (title, tracks) -> title to tracks.map { it.optInt("id") } }
    LaunchedEffect(group, source, query, section, audio.trackId, audio.queueIndex, catalogKey) {
        if (scroll) {
            var target = 0
            if (section == "queue") target = (audio.queueIndex + 1).coerceAtLeast(0)
            else {
                var offset = 0
                groups.forEach { (title, tracks) ->
                    val index = tracks.indexOfFirst { it.optInt("id") == audio.trackId }
                    if (index >= 0) { expansion[title] = true; target = offset + index + 1 }
                    offset += 1 + if (expanded(title, tracks)) tracks.size else 0
                }
            }
            // Await lazy measurement after an async catalog load or opening a folder.
            val expected = if (section == "queue") audio.queue.size + 1 else groups.entries.sumOf { (title, tracks) -> 1 + if (expanded(title, tracks)) tracks.size else 0 }
            if (expected > 0) snapshotFlow { listState.layoutInfo.totalItemsCount }.first { it >= expected }
            listState.scrollToItem(target, scrollOffset = if (section == "tracks" && target > 0) -groupHeaderSpace else 0)
        }
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().testTag("playlist-toolbar"), verticalAlignment = Alignment.CenterVertically) {
            if (searchOpen) {
                IconButton(onClick = { searchOpen = false; query = ""; keyboard?.hide() }, Modifier.size(44.dp)) {
                    Icon(Icons.Outlined.ArrowBack, "Закрыть поиск музыки", Modifier.size(20.dp))
                }
                DockedSearchBar(inputField = {
                    SearchBarDefaults.InputField(query, { query = it; section = "tracks" }, onSearch = { keyboard?.hide() },
                        expanded = false, onExpandedChange = {}, modifier = Modifier.focusRequester(searchFocus).testTag("music-search").semantics { contentDescription = "Поиск музыки" },
                        placeholder = { Text("Поиск музыки", style = MaterialTheme.typography.bodyMedium) },
                        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Очистить поиск", Modifier.size(18.dp)) } })
                }, expanded = false, onExpandedChange = {}, modifier = Modifier.weight(1f),
                    colors = SearchBarDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh), tonalElevation = 0.dp) {}
            } else {
                Text(if (section == "tracks") "Плейлист" else "Очередь · ${audio.queue.size}", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconButton(onClick = { section = "tracks"; searchOpen = true }, Modifier.size(44.dp)) {
                    Icon(Icons.Outlined.Search, "Открыть поиск музыки", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { section = if (section == "tracks") "queue" else "tracks"; keyboard?.hide() }, Modifier.size(44.dp)) {
                    Icon(if (section == "tracks") Icons.Outlined.QueueMusic else Icons.Outlined.LibraryMusic, if (section == "tracks") "Показать очередь" else "Показать треки", Modifier.size(20.dp))
                }
                Box {
                    IconButton(onClick = { filtersOpen = true }, Modifier.size(44.dp)) { Icon(Icons.Outlined.Tune, "Фильтры музыки", Modifier.size(20.dp)) }
                    DropdownMenu(filtersOpen, { filtersOpen = false }) {
                        Text("Группировка", Modifier.padding(horizontal = 16.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall)
                        listOf("none" to "Все треки", "folder" to "По папкам", "artist" to "Исполнитель", "album" to "Альбом").forEach { (id, title) ->
                            DropdownMenuItem(text = { Text(title) }, trailingIcon = { if (group == id) Icon(Icons.Outlined.Check, null) },
                                onClick = { groupChoice = id; filtersOpen = false; model.preferences(obj("music_group_by" to id)) })
                        }
                        HorizontalDivider()
                        listOf("all" to "Все источники", "file" to "Файлы", "stream" to "Радио").forEach { (id, title) ->
                            DropdownMenuItem(text = { Text(title) }, trailingIcon = { if (source == id) Icon(Icons.Outlined.Check, null) }, onClick = { source = id; filtersOpen = false })
                        }
                        HorizontalDivider()
                        DropdownMenuItem(text = { Text("Перемешивать") }, trailingIcon = { Switch(audio.shuffle, { audio.shuffle = it }, Modifier.testTag("music-shuffle")) }, onClick = { audio.shuffle = !audio.shuffle })
                        Text("Громкость", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall)
                        Slider(audio.volume, { audio.volume = it }, Modifier.width(240.dp).padding(horizontal = 16.dp).semantics { contentDescription = "Громкость музыки" })
                    }
                }
            }
            if (close != null) IconButton(onClick = close, Modifier.size(44.dp)) { Icon(Icons.Outlined.Close, "Закрыть", Modifier.size(20.dp)) }
        }
        audio.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        model.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        val trackRow: @Composable (JSONObject) -> Unit = { track -> MusicTrackRow(model, track, shown) { deleting = it } }
        val queueRow: @Composable (Int) -> Unit = { index -> QueueTrackRow(audio, index) }
        if (scroll) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("playlist-list"), state = listState, verticalArrangement = Arrangement.spacedBy(0.dp)) {
                if (section == "queue") {
                    if (audio.queue.isEmpty()) item { PlaylistEmpty("Очередь пока пуста", "Добавьте трек через меню ⋯") }
                    else item { TextButton(onClick = audio::clearQueue, contentPadding = PaddingValues(4.dp)) { Text("Очистить очередь", style = MaterialTheme.typography.labelSmall) } }
                    items(audio.queue.size) { queueRow(it) }
                } else {
                    if (shown.isEmpty()) item { PlaylistEmpty("Ничего не найдено", "Попробуйте другое название или источник") }
                    groups.forEach { (title, tracks) ->
                        stickyHeader(key = "group:$title") { MusicGroupHeading(title, tracks.size, expanded(title, tracks),
                            toggle = { expansion[title] = !expanded(title, tracks) }, measured = { groupHeaderSpace = it }) }
                        if (expanded(title, tracks)) items(tracks, key = { it.getInt("id") }) { trackRow(it) }
                    }
                    if (addMusic != null) item(key = "add-music") { AddMusicRow(addMusic) }
                }
            }
        } else Column(Modifier.fillMaxWidth().testTag("playlist-list"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (section == "queue") {
                if (audio.queue.isEmpty()) PlaylistEmpty("Очередь пока пуста", "Добавьте трек через меню ⋯")
                else TextButton(onClick = audio::clearQueue) { Text("Очистить очередь") }
                audio.queue.indices.forEach { queueRow(it) }
            } else {
                if (shown.isEmpty()) PlaylistEmpty("Ничего не найдено", "Попробуйте другое название или источник")
                groups.forEach { (title, tracks) -> MusicGroupHeading(title, tracks.size, expanded(title, tracks), { expansion[title] = !expanded(title, tracks) }); if (expanded(title, tracks)) tracks.forEach { trackRow(it) } }
                if (addMusic != null) AddMusicRow(addMusic)
            }
        }
        if (audio.trackId != null) PlaylistTransport(audio, compact = searching)
    }
    deleting?.let { id -> ConfirmDelete("трек", { deleting = null }) { deleting = null; model.delete("/api/workouts/music/tracks/$id/") } }
}

@Composable private fun AddMusicRow(add: () -> Unit) {
    TextButton(onClick = add, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).testTag("playlist-add-music")) {
        Icon(Icons.Outlined.FileUpload, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Добавить музыку")
    }
}

@Composable private fun MusicGroupHeading(title: String, count: Int, expanded: Boolean, toggle: () -> Unit, measured: (Int) -> Unit = {}) {
    Surface(modifier = Modifier.onSizeChanged { measured(it.height) }, color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.fillMaxWidth().testTag("playlist-group-$title").semantics { stateDescription = if (expanded) "Развёрнуто" else "Свёрнуто" }.clickable(onClick = toggle).heightIn(min = 44.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(count.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable private fun MusicTrackRow(model: AppModel, track: JSONObject, tracks: List<JSONObject>, delete: (Int) -> Unit) {
    var menu by remember(track.optInt("id")) { mutableStateOf(false) }
    val audio = model.audio; val id = track.getInt("id"); val selected = audio.trackId == id
    val name = track.text("title", track.text("name")); val artist = track.text("artist")
    ListItem(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).testTag("music-track-$id"),
        colors = ListItemDefaults.colors(containerColor = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .08f) else MaterialTheme.colorScheme.surface),
        headlineContent = {
            Column(Modifier.fillMaxWidth().clickable { if (selected) audio.toggle() else audio.play(track, tracks, model.token) }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                if (artist.isNotBlank()) Text(artist, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }, leadingContent = {
            IconButton(onClick = { if (selected) audio.toggle() else audio.play(track, tracks, model.token) }, modifier = Modifier.size(36.dp)) {
                Icon(if (selected && audio.playRequested) Icons.Outlined.Pause else if (selected) Icons.Outlined.PlayArrow else if (track.text("source_type") == "stream") Icons.Outlined.Radio else Icons.Outlined.MusicNote,
                    "${if (selected && audio.playRequested) "Пауза" else "Воспроизвести"}: $name", Modifier.size(20.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }, trailingContent = {
            Box {
                IconButton(onClick = { menu = true }, Modifier.size(40.dp)) { Icon(Icons.Outlined.MoreHoriz, "Действия с треком: $name", Modifier.size(18.dp)) }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Text("Играть") }, leadingIcon = { Icon(Icons.Outlined.PlayArrow, null) }, onClick = { menu = false; audio.play(track, tracks, model.token) })
                    DropdownMenuItem(text = { Text("Следующим") }, leadingIcon = { Icon(Icons.Outlined.SkipNext, null) }, onClick = { menu = false; audio.enqueue(track, next = true) })
                    DropdownMenuItem(text = { Text("В очередь") }, leadingIcon = { Icon(Icons.Outlined.PlaylistAdd, null) }, onClick = { menu = false; audio.enqueue(track) })
                    if (track.optBoolean("is_mine") && track.text("source_type") != "stream") DropdownMenuItem(text = { Text("Удалить") }, onClick = { menu = false; delete(id) })
                }
            }
        })

}

@Composable private fun QueueTrackRow(audio: AudioController, index: Int) {
    val item = audio.queue.getOrNull(index) ?: return
    var menu by remember { mutableStateOf(false) }
    val active = audio.queueIndex == index
    ListItem(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).testTag("queue-$index").semantics { selected = active },
        colors = ListItemDefaults.colors(containerColor = if (active) MaterialTheme.colorScheme.primary.copy(alpha = .08f) else MaterialTheme.colorScheme.surface),
        leadingContent = { Text((index + 1).toString().padStart(2, '0'), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(item.second, Modifier.fillMaxWidth().clickable { audio.playQueued(index) }.padding(vertical = 8.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) },
        trailingContent = {
        Box {
            IconButton(onClick = { menu = true }, Modifier.size(40.dp)) { Icon(Icons.Outlined.MoreHoriz, "Действия в очереди ${index + 1}", Modifier.size(18.dp)) }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Text("Играть") }, onClick = { menu = false; audio.playQueued(index) })
                DropdownMenuItem(text = { Text("Выше") }, enabled = index > 0, onClick = { menu = false; audio.move(index, index - 1) })
                DropdownMenuItem(text = { Text("Ниже") }, enabled = index < audio.queue.lastIndex, onClick = { menu = false; audio.move(index, index + 1) })
                DropdownMenuItem(text = { Text("Убрать") }, onClick = { menu = false; audio.remove(index) })
            }
        }
        })

}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun PlaylistTransport(audio: AudioController, compact: Boolean = false) {
    Column(Modifier.fillMaxWidth().testTag("playlist-transport"), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).padding(end = 6.dp).clip(RoundedCornerShape(4.dp))) { Text(audio.title, Modifier.basicMarquee(iterations = Int.MAX_VALUE), style = MaterialTheme.typography.bodySmall, maxLines = 1) }
            IconButton(onClick = { audio.next(-1) }, Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipPrevious, "Предыдущий трек", Modifier.size(20.dp)) }
            FilledTonalIconButton(onClick = audio::toggle, Modifier.width(64.dp).height(44.dp).semantics { contentDescription = "Пауза или воспроизведение в плейлисте"; stateDescription = if (audio.buffering && audio.playRequested) "Загрузка трека" else if (audio.playRequested) "Воспроизведение" else "Пауза" }, shape = RoundedCornerShape(50)) {
                if (audio.buffering && audio.playRequested) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                else Icon(if (audio.playRequested) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary)
            }
            IconButton(onClick = { audio.next() }, Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipNext, "Следующий трек в плейлисте", Modifier.size(20.dp)) }
        }
        if (audio.durationMs > 0 && !compact) {
            MusicSeekBar(audio, Modifier.testTag("music-seek"), showTimes = true)
        }
    }
}

@Composable private fun PlaylistEmpty(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Outlined.QueueMusic, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
