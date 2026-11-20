package com.fittodoay.android

import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.*
import androidx.media3.datasource.*
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.*
import org.json.JSONArray
import java.security.MessageDigest

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private lateinit var player: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())
    private var ownerToken = ""
    private fun storage() = getSharedPreferences("music-" + MessageDigest.getInstance("SHA-256")
        .digest(ownerToken.toByteArray()).joinToString("") { "%02x".format(it) }, MODE_PRIVATE)
    private val checkpoint = object : Runnable { override fun run() { save(); handler.postDelayed(this, 3000) } }
    override fun onCreate() {
        super.onCreate()
        ownerToken = SessionStore(this).read()
        val http = androidx.media3.datasource.okhttp.OkHttpDataSource.Factory(okhttp3.OkHttpClient.Builder().protocols(listOf(okhttp3.Protocol.HTTP_1_1)).followRedirects(false).followSslRedirects(false).build())
        val resolver = ResolvingDataSource.Factory(DefaultDataSource.Factory(this, http)) { spec ->
            val origin = Uri.parse(BuildConfig.SERVER_URL)
            if (spec.uri.scheme != "https") throw java.io.IOException("Only HTTPS media is supported")
            val own = spec.uri.host == origin.host && spec.uri.port == origin.port
            if (own) spec.withRequestHeaders(spec.httpRequestHeaders + mapOf("Authorization" to "Token ${SessionStore(this).read()}")) else spec
        }
        player = ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(resolver)
            .setLoadErrorHandlingPolicy(androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy(6))).build().apply {
            setAudioAttributes(AudioAttributes.DEFAULT, true); setHandleAudioBecomingNoisy(true)
            repeatMode = Player.REPEAT_MODE_ALL
        }
        val saved = storage()
        val items = runCatching { JSONArray(saved.getString("queue", "[]")).objects().map { item ->
            MediaItem.Builder().setMediaId(item.text("id")).setUri(item.text("uri"))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(item.text("title")).setArtist(item.text("artist")).setAlbumTitle(item.text("album")).build()).build()
        } }.getOrDefault(emptyList())
        if (items.isNotEmpty()) player.setMediaItems(items, saved.getInt("index", 0).coerceIn(items.indices), saved.getLong("position", 0).coerceAtLeast(0))
        player.shuffleModeEnabled = saved.getBoolean("shuffle", false)
        player.volume = saved.getFloat("volume", 1f).coerceIn(0f, 1f)
        player.prepare()
        player.addListener(object : Player.Listener { override fun onEvents(player: Player, events: Player.Events) { save() } })
        session = MediaSession.Builder(this, player).setSessionActivity(android.app.PendingIntent.getActivity(this, 700,
            Intent(this, MainActivity::class.java), android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)).build()
        handler.post(checkpoint)
    }
    private fun save() {
        if (!::player.isInitialized) return
        val items = (0 until player.mediaItemCount).map { index -> val item = player.getMediaItemAt(index)
            obj("id" to item.mediaId, "uri" to item.localConfiguration?.uri.toString(), "title" to item.mediaMetadata.title?.toString(), "artist" to item.mediaMetadata.artist?.toString(), "album" to item.mediaMetadata.albumTitle?.toString()) }
        storage().edit().putString("queue", JSONArray(items).toString()).putInt("index", player.currentMediaItemIndex.coerceAtLeast(0))
            .putLong("position", player.currentPosition.coerceAtLeast(0)).putBoolean("shuffle", player.shuffleModeEnabled).putFloat("volume", player.volume).apply()
    }
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "com.fittodoay.ACCOUNT_CHANGED") {
            save(); player.stop(); player.clearMediaItems(); ownerToken = SessionStore(this).read()
            val saved = storage()
            val items = runCatching { JSONArray(saved.getString("queue", "[]")).objects().map { item -> MediaItem.Builder()
                .setMediaId(item.text("id")).setUri(item.text("uri"))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(item.text("title")).setArtist(item.text("artist")).setAlbumTitle(item.text("album")).build()).build() } }.getOrDefault(emptyList())
            if (ownerToken.isNotEmpty() && items.isNotEmpty()) player.setMediaItems(items, saved.getInt("index", 0).coerceIn(items.indices), saved.getLong("position", 0))
            player.shuffleModeEnabled = saved.getBoolean("shuffle", false); player.volume = saved.getFloat("volume", 1f); player.prepare()
        }
        return super.onStartCommand(intent, flags, startId)
    }
    override fun onTaskRemoved(rootIntent: Intent?) { if (!player.playWhenReady) stopSelf() }
    override fun onDestroy() {
        handler.removeCallbacks(checkpoint); save(); session?.release(); player.release(); super.onDestroy()
    }
}
