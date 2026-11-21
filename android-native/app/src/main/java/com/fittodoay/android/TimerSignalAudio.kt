package com.fittodoay.android

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper

/** Foreground cue when notification permission is denied. Background notifications use SystemUI audio focus. */
object TimerSignalAudio {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private var audio: AudioManager? = null
    private val release = Runnable { stop() }

    fun play(context: Context) {
        if (Looper.myLooper() != Looper.getMainLooper()) { handler.post { play(context.applicationContext) }; return }
        handler.removeCallbacks(release)
        if (focus == null) {
            val manager = context.getSystemService(AudioManager::class.java)
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setOnAudioFocusChangeListener({ change -> if (change < 0) stop() }, handler).build()
            val granted = runCatching { manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED }.getOrDefault(false)
            if (!granted) return // Respect calls and Android's background focus restrictions.
            audio = manager; focus = request
        }
        player?.release(); player = null
        try {
            val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
            val cue = MediaPlayer.create(context, R.raw.timer_complete, attributes, 0) ?: error("Timer sound could not be opened")
            player = cue
            cue.setOnCompletionListener { if (player === cue) stop() }
            cue.setOnErrorListener { _, _, _ -> if (player === cue) stop(); true }
            cue.start()
            handler.postDelayed(release, 2500) // Release focus even if a device fails to report completion.
        } catch (error: Exception) { stop() }
    }

    private fun stop() {
        handler.removeCallbacks(release)
        player?.release(); player = null
        focus?.let { request -> audio?.abandonAudioFocusRequest(request) }
        focus = null; audio = null
    }
}
