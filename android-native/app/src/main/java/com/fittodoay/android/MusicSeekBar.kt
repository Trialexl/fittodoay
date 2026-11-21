package com.fittodoay.android

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp

/** Material owns track geometry, RTL, focus, touch and accessibility. Media3 owns the position. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MusicSeekBar(audio: AudioController, modifier: Modifier = Modifier) {
    var seeking by remember(audio.trackId, audio.queueIndex) { mutableStateOf<Float?>(null) }
    val interactions = remember { MutableInteractionSource() }
    val colors = SliderDefaults.colors(inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant)
    Slider(value = seeking ?: (audio.positionMs.toFloat() / audio.durationMs.coerceAtLeast(1)).coerceIn(0f, 1f),
        onValueChange = { seeking = it }, enabled = audio.durationMs > 0,
        onValueChangeFinished = { seeking?.let { audio.seek((it * audio.durationMs).toLong()) }; seeking = null },
        modifier = modifier.fillMaxWidth().semantics { contentDescription = "Перемотка трека" }, colors = colors, interactionSource = interactions,
        thumb = { SliderDefaults.Thumb(interactionSource = interactions, colors = colors, thumbSize = DpSize(12.dp, 12.dp)) },
        track = { SliderDefaults.Track(it, Modifier.height(3.dp), colors = colors, drawStopIndicator = null, thumbTrackGapSize = 0.dp) })
}
