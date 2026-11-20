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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MiniPlayer(model: AppModel) {
    val audio = model.audio
    var seeking by remember { mutableStateOf<Float?>(null) }
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp).testTag("mini-player"), shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 0.dp) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = {
                    if (audio.trackId == null) model.tracks.firstOrNull()?.let { audio.play(it, model.tracks, model.token) } else audio.toggle()
                }, enabled = audio.trackId != null || model.tracks.isNotEmpty(), modifier = Modifier.size(40.dp)) {
                    Icon(if (audio.playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, "Пауза или воспроизведение", Modifier.size(20.dp))
                }
                Text(audio.title.ifBlank { "Выберите трек" }, Modifier.weight(1f).clickable(enabled = !model.busy) { model.navigate(Screen.Settings) }, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                IconButton(onClick = { audio.next() }, enabled = audio.trackId != null, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipNext, "Следующий трек", Modifier.size(20.dp)) }
                IconButton(onClick = { audio.shuffle = !audio.shuffle }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Outlined.Shuffle, "Случайный порядок", Modifier.size(18.dp), tint = if (audio.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { model.navigate(Screen.Settings) }, enabled = !model.busy, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.QueueMusic, "Плейлист", Modifier.size(20.dp)) }
            }
            Slider(value = seeking ?: if (audio.durationMs > 0) (audio.positionMs.toFloat() / audio.durationMs).coerceIn(0f, 1f) else 0f,
                onValueChange = { seeking = it }, enabled = audio.durationMs > 0,
                onValueChangeFinished = { audio.seek(((seeking ?: 0f) * audio.durationMs).toLong()); seeking = null },
                thumb = { Box(Modifier.size(12.dp).background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape)) },
                track = { state ->
                    val track = MaterialTheme.colorScheme.outlineVariant; val accent = MaterialTheme.colorScheme.primary
                    androidx.compose.foundation.Canvas(Modifier.fillMaxWidth().height(3.dp)) {
                        drawLine(track, androidx.compose.ui.geometry.Offset(0f, size.height / 2), androidx.compose.ui.geometry.Offset(size.width, size.height / 2), strokeWidth = size.height)
                        drawLine(accent, androidx.compose.ui.geometry.Offset(0f, size.height / 2), androidx.compose.ui.geometry.Offset(size.width * state.value, size.height / 2), strokeWidth = size.height)
                    }
                }, modifier = Modifier.fillMaxWidth().height(16.dp).semantics { contentDescription = "Перемотка трека" })
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(playbackTime(audio.positionMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(playbackTime(audio.durationMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun playbackTime(milliseconds: Long): String {
    val seconds = milliseconds.coerceAtLeast(0) / 1000
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
}
