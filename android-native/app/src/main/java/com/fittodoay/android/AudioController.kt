package com.fittodoay.android

import android.content.ComponentName
import android.content.Context
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.media3.common.*
import androidx.media3.session.*
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

class AudioController(context: Context) {
    private val app = context.applicationContext
    private var controller: MediaController? = null
    private val future = MediaController.Builder(app, SessionToken(app, ComponentName(app, PlaybackService::class.java))).buildAsync()
    private val handler = Handler(Looper.getMainLooper())
    private val pending = mutableListOf<(MediaController) -> Unit>()
    private var released = false
    var trackId by mutableStateOf<Int?>(null); private set
    var title by mutableStateOf(""); private set
    var playing by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var positionMs by mutableLongStateOf(0); private set
    var durationMs by mutableLongStateOf(0); private set
    var queue by mutableStateOf<List<Pair<Int, String>>>(emptyList()); private set
    private var shuffleState by mutableStateOf(false)
    var shuffle: Boolean get() = shuffleState
        set(value) { shuffleState = value; ready { it.shuffleModeEnabled = value } }
    private var volumeState by mutableFloatStateOf(1f)
    var volume: Float get() = volumeState
        set(value) { volumeState = value.coerceIn(0f, 1f); ready { it.volume = volumeState } }
    private val observer = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) { sync() }
        override fun onPlayerError(exception: PlaybackException) {
            if (BuildConfig.DEBUG) android.util.Log.w("fitTODOay", "Playback failed: ${exception.errorCodeName}", exception)
            error = "Не удалось воспроизвести трек. Проверьте соединение или выберите другой."; sync()
        }
    }
    private val tick = object : Runnable { override fun run() { sync(); handler.postDelayed(this, 500) } }
    init {
        future.addListener({ runCatching {
            if (!released) {
                val player = future.get(); controller = player; player.addListener(observer)
                pending.toList().forEach { it(player) }; pending.clear(); sync(); handler.post(tick)
            }
        }.onFailure { error = "Не удалось запустить плеер" } }, ContextCompat.getMainExecutor(app))
    }
    private fun ready(action: (MediaController) -> Unit) { if (!released) controller?.let(action) ?: run { pending += action } }
    private fun sync() { controller?.let { player ->
        trackId = player.currentMediaItem?.mediaId?.toIntOrNull(); title = player.mediaMetadata.title?.toString().orEmpty(); playing = player.isPlaying
        if (player.playerError == null && player.playbackState != Player.STATE_IDLE) error = null
        positionMs = player.currentPosition.coerceAtLeast(0); durationMs = player.duration.takeIf { it > 0 } ?: 0
        shuffleState = player.shuffleModeEnabled; volumeState = player.volume
        queue = (0 until player.mediaItemCount).map { val item = player.getMediaItemAt(it); (item.mediaId.toIntOrNull() ?: -1) to item.mediaMetadata.title?.toString().orEmpty() }
    } }
    fun play(track: JSONObject, tracks: List<JSONObject>, authToken: String) {
        if (authToken.isEmpty()) return
        error = null
        val items = tracks.map { item ->
            val raw = item.text("url"); val uri = if (raw.startsWith('/')) BuildConfig.SERVER_URL + raw else raw
            MediaItem.Builder().setMediaId(item.getInt("id").toString()).setUri(uri).setMediaMetadata(MediaMetadata.Builder()
                .setTitle(item.text("title", item.text("name"))).setArtist(item.text("artist")).setAlbumTitle(item.text("album")).build()).build()
        }
        ready { player -> player.setMediaItems(items, tracks.indexOfFirst { it.optInt("id") == track.optInt("id") }.coerceAtLeast(0), 0); player.prepare(); player.play() }
    }
    fun toggle() = ready { if (it.playWhenReady) it.pause() else { error = null; it.prepare(); it.play() } }
    fun next(direction: Int = 1) = ready { if (direction < 0) it.seekToPreviousMediaItem() else it.seekToNextMediaItem() }
    fun seek(position: Long) = ready { it.seekTo(position.coerceIn(0, durationMs.coerceAtLeast(0))) }
    fun move(from: Int, to: Int) = ready { if (from in 0 until it.mediaItemCount && to in 0 until it.mediaItemCount) it.moveMediaItem(from, to) }
    fun remove(index: Int) = ready { if (index in 0 until it.mediaItemCount) it.removeMediaItem(index) }
    fun enqueue(track: JSONObject) = ready { player ->
        val raw = track.text("url"); val uri = if (raw.startsWith('/')) BuildConfig.SERVER_URL + raw else raw
        player.addMediaItem(MediaItem.Builder().setMediaId(track.getInt("id").toString()).setUri(uri)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(track.text("title", track.text("name"))).setArtist(track.text("artist")).setAlbumTitle(track.text("album")).build()).build())
        player.prepare()
    }
    fun stop() = ready { it.stop(); it.clearMediaItems(); error = null; sync() }
    fun accountChanged() { app.startService(android.content.Intent(app, PlaybackService::class.java).setAction("com.fittodoay.ACCOUNT_CHANGED")) }
    fun release() { released = true; pending.clear(); handler.removeCallbacks(tick); controller?.removeListener(observer); MediaController.releaseFuture(future) }
}
