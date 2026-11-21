package com.fittodoay.android

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File

/** Bundled synthetic clip only: no account, upload, or modification of training data. */
class MediaComponentsTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun media3VideoControlsPlaybackAndBackgroundPause() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("componentParity") == "true")
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val file = File(context.cacheDir, "component-video-${java.util.UUID.randomUUID()}.mp4")
        instrumentation.context.assets.open("qa-technique-real.mp4").use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        val device = UiDevice.getInstance(instrumentation)
        val idleBefore = Configurator.getInstance().waitForIdleTimeout
        Configurator.getInstance().waitForIdleTimeout = 0
        try {
            compose.setContent { MaterialTheme { LocalTechniqueVideo(file) } }
            fun state() = compose.onNodeWithTag("technique-video-player").fetchSemanticsNode().config[SemanticsProperties.StateDescription]
            compose.waitUntil(15_000) { state() == "Воспроизведение" }
            if (!device.hasObject(By.desc("Pause"))) compose.onNodeWithTag("technique-video-player").performTouchInput { click(center) }
            checkNotNull(device.wait(Until.findObject(By.desc("Pause")), 5000)) { "Media3 pause control was not shown" }.click()
            compose.waitUntil(5000) { state() == "Пауза" }
            checkNotNull(device.wait(Until.findObject(By.desc("Play")), 5000)).click()
            compose.waitUntil(5000) { state() == "Воспроизведение" }
            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            compose.waitUntil(5000) { state() == "Пауза" }
            compose.onNodeWithTag("technique-video-player").assertIsDisplayed()
            if (!device.hasObject(By.desc("Play"))) compose.onNodeWithTag("technique-video-player").performTouchInput { click(center) }
            checkNotNull(device.wait(Until.findObject(By.desc("Play")), 5000)) { "Media3 controls did not return after resuming the activity" }
            // Lifecycle state is published before the resumed window commits its frame.
            val frame = java.util.concurrent.CountDownLatch(1)
            compose.runOnUiThread {
                val view = compose.activity.window.decorView
                view.viewTreeObserver.registerFrameCommitCallback { frame.countDown() }
                view.invalidate()
            }
            assertTrue("The resumed video window must render", frame.await(8, java.util.concurrent.TimeUnit.SECONDS))
            instrumentation.uiAutomation.waitForIdle(500, 5000)
            var videoLuminance = 0.0
            compose.waitUntil(10_000) {
                val bounds = compose.onNodeWithTag("technique-video-player").fetchSemanticsNode().boundsInWindow
                val pixels = instrumentation.uiAutomation.takeScreenshot()
                var sum = 0L; var count = 0
                // The bundled clip has a lit wall in this area, above the controls.
                // A recreated SurfaceView must display video, not just black + controls.
                for (y in (bounds.top + bounds.height * .22f).toInt() until (bounds.top + bounds.height * .36f).toInt() step 8)
                    for (x in (bounds.left + bounds.width * .2f).toInt() until (bounds.left + bounds.width * .8f).toInt() step 8) {
                        val color = pixels.getPixel(x.coerceIn(0, pixels.width - 1), y.coerceIn(0, pixels.height - 1))
                        sum += android.graphics.Color.red(color) + android.graphics.Color.green(color) + android.graphics.Color.blue(color); count++
                    }
                pixels.recycle(); videoLuminance = sum.toDouble() / (3 * count.coerceAtLeast(1))
                videoLuminance > 12
            }
            val directory = File(context.filesDir, "extended-parity").apply { mkdirs() }
            val screenshot = instrumentation.uiAutomation.takeScreenshot()
            File(directory, "components-video.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG, 100, it) }; screenshot.recycle()
            File(directory, "components-video.json").writeText(obj("result" to "passed", "source" to "bundled-synthetic-video", "pause_resume" to true, "background_pause" to true, "resumed_frame_luminance" to videoLuminance).toString())
        } finally { Configurator.getInstance().waitForIdleTimeout = idleBefore; file.delete() }
    }
}
