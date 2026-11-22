package com.fittodoay.android

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp

/** Material owns track geometry, RTL, focus, touch and accessibility. Media3 owns the position. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MusicSeekBar(audio: AudioController, modifier: Modifier = Modifier, showTimes: Boolean = false) {
    var seeking by remember(audio.trackId, audio.queueIndex) { mutableStateOf<Float?>(null) }
    val interactions = remember { MutableInteractionSource() }
    val colors = SliderDefaults.colors(inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant)
    val previewPosition = seeking?.let { (it * audio.durationMs).toLong() } ?: audio.positionMs
    Column {
    Box(modifier.fillMaxWidth().heightIn(min = 48.dp).semantics(mergeDescendants = true) {}, contentAlignment = Alignment.Center) {
    Slider(value = seeking ?: (audio.positionMs.toFloat() / audio.durationMs.coerceAtLeast(1)).coerceIn(0f, 1f),
        onValueChange = { seeking = it }, enabled = audio.durationMs > 0,
        onValueChangeFinished = { seeking?.let { audio.seek((it * audio.durationMs).toLong()) }; seeking = null },
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = "Перемотка трека"
            stateDescription = "${musicPosition(previewPosition)} из ${musicPosition(audio.durationMs)}"
        }, colors = colors, interactionSource = interactions,
        thumb = { SliderDefaults.Thumb(interactionSource = interactions, colors = colors, thumbSize = DpSize(20.dp, 20.dp)) },
        track = { SliderDefaults.Track(it, Modifier.height(4.dp), colors = colors, drawStopIndicator = null, thumbTrackGapSize = 0.dp) })
    }
        if (showTimes) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(musicPosition(previewPosition), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(musicPosition(audio.durationMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
private fun musicPosition(ms: Long) = "${ms / 60000}:${((ms / 1000) % 60).toString().padStart(2, '0')}"
