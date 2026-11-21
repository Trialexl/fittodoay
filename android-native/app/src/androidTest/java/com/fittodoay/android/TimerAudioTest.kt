package com.fittodoay.android

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

/** Real Android audio focus and Media3 playback; no changes to server workout or music data. */
class TimerAudioTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun audioDump(): String = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("dumpsys audio")
    ).use { it.readBytes().toString(Charsets.UTF_8) }
    private fun focusStack(dump: String) = dump.substringAfter("Audio Focus stack entries").substringBefore("No external focus policy")
    private fun duckingRequested(dump: String) = focusStack(dump).contains("GAIN_TRANSIENT_MAY_DUCK")

    @Test fun timerSignalsDuckAndRestoreMusicThroughNotificationAndPermissionDeniedPaths() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timerAudio") == "true")
        val qa = QaHarness(compose); qa.guard(requireNetwork = false)
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val notifications = qa.context.getSystemService(NotificationManager::class.java)
        val denied = InstrumentationRegistry.getArguments().getString("timerAudioDenied") == "true"
        assertEquals("Host must set the expected notification permission on the QA AVD", !denied, notifications.areNotificationsEnabled())
        val timerStore = TimerStore(qa.context, "timer-audio:${java.util.UUID.randomUUID()}")
        val playing = AtomicBoolean(false)
        lateinit var music: ExoPlayer
        compose.runOnIdle {
            assertFalse("Do not interrupt an existing QA playback session", qa.model.audio.playing)
            music = ExoPlayer.Builder(qa.context).build().apply {
                setAudioAttributes(AudioAttributes.DEFAULT, true)
                volume = .65f
                repeatMode = Player.REPEAT_MODE_ALL
                setMediaItem(MediaItem.fromUri(Uri.parse("android.resource://${qa.context.packageName}/${R.raw.timer_complete}")))
                addListener(object : Player.Listener { override fun onIsPlayingChanged(isPlaying: Boolean) { playing.set(isPlaying) } })
                prepare(); play()
            }
        }
        try {
            compose.waitUntil(10_000) { playing.get() }
            for (mode in if (denied) listOf("rest") else listOf("rest", "execution")) {
                val report = if (denied) "foreground-denied" else mode
                if (mode == "execution") device.pressHome()
                val before = audioDump()
                assertFalse(duckingRequested(before))
                compose.runOnUiThread {
                    run {
                        timerStore.save(mode, 0, obj("duration" to 1))
                        val id = timerStore.read(mode)!!.text("id")
                        assertTrue(timerStore.claimSignal(mode, id))
                        TimerReceiver.signal(qa.context, mode)
                        timerStore.clear(mode) // Same immediate state cleanup as automatic completion in AppModel.
                    }
                }
                var during = ""
                try { compose.waitUntil(8_000) { audioDump().also { during = it }.let(::duckingRequested) } }
                finally { java.io.File(qa.directory, "timer-audio-$report-during.txt").writeText(during) }
                if (!denied) {
                    val channel = notifications.getNotificationChannel("workout-timer-signals")
                    assertNotNull(channel.sound)
                    val ducked = during.substringAfter("ducked players piids:").substringBefore("faded out players piids:")
                    assertTrue("Android must duck the playing media track", ducked.contains("uid:"))
                }
                compose.waitUntil(8_000) { !duckingRequested(audioDump()) }
                compose.runOnUiThread { assertTrue(music.isPlaying); assertEquals(.65f, music.volume, .001f) }
                val after = audioDump()
                if (!denied) assertFalse("Android must restore the media track after the cue",
                    after.substringAfter("ducked players piids:").substringBefore("faded out players piids:").contains("uid:"))
                java.io.File(qa.directory, "timer-audio-$report-after.txt").writeText(after)
                notifications.cancel(if (mode == "rest") 601 else 602)
                if (mode == "execution") {
                    compose.runOnUiThread {
                        compose.activity.startActivity(Intent(compose.activity, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                    }
                    compose.waitUntil(8_000) { compose.activity.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED) }
                }
                qa.report("timer-audio-$report", obj("result" to "passed", "transient_focus" to true,
                    "music_kept_playing" to true, "user_volume_preserved" to true))
            }
        } finally {
            timerStore.clear("rest", dismissSignal = true); timerStore.clear("execution", dismissSignal = true)
            notifications.cancel(601); notifications.cancel(602)
            compose.runOnUiThread { music.release() }
        }
    }
}
