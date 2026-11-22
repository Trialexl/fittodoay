package com.fittodoay.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MiniPlayer(model: AppModel) {
    val audio = model.audio
    var playlist by remember { mutableStateOf(false) }
    val compact = audio.trackId == null || model.workoutTimerActive
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = if (compact) 4.dp else 8.dp).testTag("mini-player"), shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 0.dp) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = if (compact) 0.dp else 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FilledTonalIconButton(onClick = {
                    if (audio.trackId == null) model.tracks.firstOrNull()?.let { audio.play(it, model.tracks, model.token) } else audio.toggle()
                }, enabled = audio.trackId != null || model.tracks.isNotEmpty(), modifier = Modifier.size(40.dp).semantics { contentDescription = "Пауза или воспроизведение"; stateDescription = if (audio.buffering && audio.playRequested) "Загрузка трека" else if (audio.playRequested) "Воспроизведение" else "Пауза" }) {
                    if (audio.buffering && audio.playRequested) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(if (audio.playRequested) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, null, Modifier.size(20.dp))
                }
                Text(audio.title.ifBlank { "Выберите трек" }, Modifier.weight(1f).clickable { playlist = true }, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (audio.trackId != null) IconButton(onClick = { audio.next() }, enabled = audio.trackId != null, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipNext, "Следующий трек", Modifier.size(20.dp)) }
                if (audio.trackId != null) IconButton(onClick = { audio.shuffle = !audio.shuffle }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Outlined.Shuffle, "Случайный порядок", Modifier.size(18.dp), tint = if (audio.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { playlist = true }, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.QueueMusic, "Плейлист", Modifier.size(20.dp)) }
            }
            if (audio.durationMs > 0 && compact) LinearProgressIndicator(progress = { (audio.positionMs.toFloat() / audio.durationMs).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(2.dp))
            if (audio.durationMs > 0 && !compact) MusicSeekBar(audio, Modifier.testTag("mini-music-seek"))
            if (audio.durationMs > 0 && !compact) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(playbackTime(audio.positionMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(playbackTime(audio.durationMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (playlist) PlaylistSheet(model) { playlist = false }
}

private fun playbackTime(milliseconds: Long): String {
    val seconds = milliseconds.coerceAtLeast(0) / 1000
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
}
