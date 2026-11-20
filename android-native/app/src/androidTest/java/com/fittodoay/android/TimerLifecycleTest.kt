package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Host runner kills the background process between these two phases. */
class TimerLifecycleTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun prepareAlarm() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timerPhase") == "prepare")
        val qa = QaHarness(compose); qa.guard(requireNetwork = false)
        compose.runOnIdle { qa.model.restDuration = 30; qa.model.restUntil = System.currentTimeMillis() + 30_000 }
        compose.onNode(hasText("Время восстановиться", substring = false) and hasAnyAncestor(isDialog())).assertIsDisplayed()
        val state = requireNotNull(TimerStore(qa.context, SessionStore(qa.context).read()).read("rest"))
        qa.report("timer-process-before", state)
    }
    @Test fun verifyAlarmAfterProcessDeath() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timerPhase") == "verify")
        // Do not clear the persisted timer in QaHarness.guard before checking it.
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = TimerStore(context, SessionStore(context).read())
        val state = requireNotNull(store.read("rest"))
        assertTrue(state.optBoolean("notified"))
        assertTrue(state.optLong("end_at") <= System.currentTimeMillis())
        val manager = context.getSystemService(android.app.NotificationManager::class.java)
        assertTrue(manager.activeNotifications.any { it.id == 601 })
        compose.onNode(hasText("Время восстановиться", substring = false) and hasAnyAncestor(isDialog())).assertIsDisplayed()
        compose.onNodeWithText("Готово").assertIsDisplayed()
        compose.onNodeWithText("Продолжить тренировку").assertIsEnabled().performClick()
        compose.waitForIdle()
        assertNull(store.read("rest"))
        java.io.File(context.filesDir, "extended-parity/timer-process.json").writeText(obj("result" to "passed", "alarm_after_process_death" to true, "notification" to true).toString(2))
    }
}
