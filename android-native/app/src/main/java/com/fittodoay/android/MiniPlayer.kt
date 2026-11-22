package com.fittodoay.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import dev.chrisbanes.haze.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MiniPlayer(model: AppModel, backdrop: HazeState? = null) {
    val audio = model.audio
    var playlist by rememberSaveable { mutableStateOf(false) }
    val compact = audio.trackId == null || model.workoutTimerActive
    val shape = RoundedCornerShape(20.dp)
    val surface = MaterialTheme.colorScheme.surface
    val glass = if (backdrop == null) Modifier.background(surface.copy(alpha = .9f)) else Modifier.hazeEffect(backdrop,
        style = HazeStyle(backgroundColor = MaterialTheme.colorScheme.background, tint = HazeTint(surface.copy(alpha = .78f)),
            blurRadius = 20.dp, noiseFactor = 0f, fallbackTint = HazeTint(surface.copy(alpha = .92f))))
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = if (compact) 6.dp else 8.dp).clip(shape).then(glass).testTag("mini-player"), shape = shape,
        color = Color.Transparent, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .7f)), shadowElevation = 0.dp) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = if (compact) 0.dp else 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FilledTonalIconButton(onClick = {
                    if (audio.trackId == null) model.tracks.firstOrNull()?.let { audio.play(it, model.tracks, model.token) } else audio.toggle()
                }, enabled = audio.trackId != null || model.tracks.isNotEmpty(), shape = RoundedCornerShape(50), modifier = Modifier.width(56.dp).height(40.dp).semantics { contentDescription = "Пауза или воспроизведение"; stateDescription = if (audio.buffering && audio.playRequested) "Загрузка трека" else if (audio.playRequested) "Воспроизведение" else "Пауза" }) {
                    if (audio.buffering && audio.playRequested) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(if (audio.playRequested) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, null, Modifier.size(20.dp))
                }
                Box(Modifier.weight(1f).clip(RoundedCornerShape(4.dp)).clickable { playlist = true }.padding(horizontal = 8.dp).testTag("current-track-title")) {
                    Text(audio.title.ifBlank { "Выберите трек" }, Modifier.basicMarquee(iterations = Int.MAX_VALUE), maxLines = 1,
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                }
                if (audio.trackId != null) IconButton(onClick = { audio.next() }, enabled = audio.trackId != null, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.SkipNext, "Следующий трек", Modifier.size(20.dp)) }
                if (audio.trackId != null) IconButton(onClick = { audio.shuffle = !audio.shuffle }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Outlined.Shuffle, "Случайный порядок", Modifier.size(18.dp), tint = if (audio.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { playlist = true }, modifier = Modifier.size(40.dp)) { Icon(Icons.Outlined.QueueMusic, "Плейлист", Modifier.size(20.dp)) }
            }
            if (audio.durationMs > 0 && compact) LinearProgressIndicator(progress = { (audio.positionMs.toFloat() / audio.durationMs).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(2.dp))
            if (audio.durationMs > 0 && !compact) MusicSeekBar(audio, Modifier.testTag("mini-music-seek"), showTimes = true)
        }
    }
    if (playlist) PlaylistSheet(model) { playlist = false }
}
