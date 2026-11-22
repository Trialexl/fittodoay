package com.fittodoay.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import java.io.File

/** Ready Media3 controls, sizing, seek, lifecycle and local offline media. */
// AndroidView owns measurement; XML LayoutParams have no parent to resolve here.
@android.annotation.SuppressLint("InflateParams")
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable fun LocalTechniqueVideo(file: File) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var player by remember(file) { mutableStateOf<ExoPlayer?>(null) }
    var position by rememberSaveable(file.absolutePath) { mutableLongStateOf(0) }
    var autoplay by rememberSaveable(file.absolutePath) { mutableStateOf(true) }
    var playing by remember(file) { mutableStateOf(false) }
    var failed by remember(file) { mutableStateOf(false) }
    DisposableEffect(file, lifecycle) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
            override fun onPlayerError(error: PlaybackException) { failed = true }
        }
        fun start() {
            if (player != null) return
            failed = false
            player = ExoPlayer.Builder(context).build().apply {
                setAudioAttributes(androidx.media3.common.AudioAttributes.DEFAULT, true)
                setHandleAudioBecomingNoisy(true)
                addListener(listener)
                setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)))
                seekTo(position); playWhenReady = autoplay; prepare()
            }
        }
        fun stop() {
            player?.let { position = it.currentPosition; autoplay = false; it.removeListener(listener); it.release() }
            player = null; playing = false
        }
        // Media3's Activity lifecycle: release the video decoder on stop and
        // prepare a new surface at the saved position on start, remaining paused.
        val observer = LifecycleEventObserver { _, event ->
            when (event) { Lifecycle.Event.ON_START -> start(); Lifecycle.Event.ON_STOP -> stop(); else -> Unit }
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) start()
        onDispose { lifecycle.removeObserver(observer); stop() }
    }
    // TextureView follows window attachment. The default SurfaceView can lose
    // its paused frame across Compose/lifecycle transitions on API 35.
    AndroidView(factory = { (android.view.LayoutInflater.from(it).inflate(R.layout.technique_player, null, false) as PlayerView).apply {
        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
        setErrorMessageProvider { android.util.Pair(0, "Не удалось воспроизвести видео") }
    } },
        update = { it.player = player },
        onRelease = { it.player = null }, modifier = Modifier.fillMaxWidth().height(300.dp).testTag("technique-video-player").semantics { stateDescription = if (failed) "Ошибка воспроизведения" else if (playing) "Воспроизведение" else "Пауза" })
}
