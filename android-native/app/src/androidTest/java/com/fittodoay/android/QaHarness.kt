package com.fittodoay.android

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.semantics.SemanticsActions
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

class QaHarness(val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>) {
    val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    lateinit var model: AppModel
    val api by lazy { Api { SessionStore(context).read() } }
    val directory get() = File(context.filesDir, "extended-parity").apply { mkdirs() }
    fun guard(preserveTimers: Boolean = false, requireNetwork: Boolean = true) {
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        val token = SessionStore(context).read()
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }
        check(token.isNotEmpty() && marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == digest) { "Not the enrolled QA account" }
        // Preserve the already-encrypted enrolled session if the host interrupts
        // a cross-account test before its finally block can restore it.
        val encrypted = context.getSharedPreferences("session", android.content.Context.MODE_PRIVATE).getString("token", null)
        check(!encrypted.isNullOrEmpty())
        File(context.filesDir, "qa-enrolled-session.json").writeText(obj("session_digest" to digest, "encrypted_token" to encrypted).toString())
        compose.runOnIdle { model = compose.activity.model }
        if (requireNetwork) waitRequest()
        ensureV2(requireNetwork)
        if (!preserveTimers) compose.runOnIdle { model.restUntil = 0; model.executionUntil = 0 }
    }
    fun ensureV2(persist: Boolean = true) {
        if (model.preferences.text("design_version") != "v2") {
            compose.runOnIdle {
                if (persist) model.preferences(obj("design_version" to "v2"))
                else model.preferences = JSONObject(model.preferences.toString()).put("design_version", "v2")
            }
            if (persist) waitRequest()
        }
        check(model.preferences.text("design_version") == "v2") { "Only V2 is in the active QA scope" }
    }
    fun waitRequest(allowError: Boolean = false) {
        compose.waitForIdle(); compose.waitUntil(240_000) { !model.busy }; compose.waitForIdle()
        if (!allowError) check(model.error == null) { model.error ?: "Request failed" }
    }
    fun navigate(screen: Screen) {
        check(model.preferences.text("design_version") == "v2") { "V1 navigation is outside the active QA scope" }
        repeat(3) {
            waitRequest()
            if (screen == Screen.Settings) compose.onNodeWithText("Ещё⌄").performClick()
            compose.onNodeWithContentDescription(screen.title).assertIsEnabled().performClick()
            waitRequest()
            if (model.screen == screen) return
        }
        error("Navigation did not reach $screen")
    }
    fun selectProgram(id: Int) {
        check(model.preferences.text("design_version") == "v2")
        check(model.screen == Screen.Programs) { "Program picker requires the Programs screen" }
        check(model.folders.any { it.optInt("id") == id }) { "Requested QA program is absent from the loaded server response" }
        compose.onNodeWithTag("select-program-$id").performScrollTo().performClick()
        compose.waitForIdle()
    }
    fun visible(text: String) = visible(hasText(text, substring = false), text)
    fun visible(matcher: SemanticsMatcher, label: String): SemanticsNodeInteraction {
        fun candidate(): SemanticsNodeInteraction? {
            val nodes = compose.onAllNodes(matcher)
            for (i in nodes.fetchSemanticsNodes().indices) if (nodes[i].isDisplayed()) return nodes[i]
            return null
        }
        candidate()?.let { return it }
        compose.onNodeWithTag("page-scroll").performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, -100_000f) }
        repeat(100) { candidate()?.let { return it }
            val page = compose.onNodeWithTag("page-scroll"); val distance = page.fetchSemanticsNode().boundsInRoot.height * 0.6f
            page.performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, distance) }; compose.waitForIdle()
        }
        capture("missing-${label.hashCode()}")
        error("Not visible: $label")
    }
    fun capture(name: String) {
        compose.waitForIdle(); InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        // Wait for native accessibility/rendering to settle. Capture the actual
        // window, including dialogs, rather than assuming a single Compose root.
        val device = androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.waitForIdle(1000)
        check(!device.hasObject(androidx.test.uiautomator.By.res("android", "aerr_close"))) { "A system ANR dialog covers the screenshot" }
        check(device.wait(androidx.test.uiautomator.Until.hasObject(androidx.test.uiautomator.By.pkg("com.fittodoay.android")), 8000)) { "The application is not visible for the screenshot" }
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            // Semantics can update before the GPU presents the new screen.
            // Wait for the focused window's rendered frame, including dialogs.
            val committed = java.util.concurrent.CountDownLatch(1)
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val roots = android.view.inspector.WindowInspector.getGlobalWindowViews()
                val view = roots.lastOrNull { it.hasWindowFocus() } ?: compose.activity.window.decorView
                if (view.isHardwareAccelerated) {
                    view.viewTreeObserver.registerFrameCommitCallback { committed.countDown() }
                    view.invalidate()
                } else committed.countDown()
            }
            check(committed.await(8, java.util.concurrent.TimeUnit.SECONDS)) { "The current screen frame was not committed" }
            device.waitForIdle(1000)
        }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    }
    fun report(name: String, value: JSONObject) { File(directory, "$name.json").writeText(value.toString(2)) }
}
