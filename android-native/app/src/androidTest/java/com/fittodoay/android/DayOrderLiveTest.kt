@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
package com.fittodoay.android

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Drag, persist, reopen and restore only a program created for annual QA charts. */
class DayOrderLiveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>(effectContext = NoMotion)
    @Test fun nativeDragPersistsOnTheActualQaServer() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("polishLive") == "true")
        val email = requireNotNull(args.getString("qaEmail"))
        check(email.startsWith("android-cross-") && email.endsWith("@example.invalid"))
        val qa = QaHarness(compose); qa.guard()
        val store = SessionStore(qa.context); val originalSession = store.read()
        val login = Api { "" }.call("/api/auth/login/", "POST", obj("email" to email, "password" to requireNotNull(args.getString("qaPassword")))) as JSONObject
        val token = login.getString("token"); val api = Api { token }
        var originalOrder = emptyList<Int>(); var templateId: Int? = null
        var verified = false
        try {
            compose.runOnIdle { qa.model.logout(); store.write(token); compose.activity.viewModelStore.clear() }
            compose.activityRule.scenario.recreate(); compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest()
            qa.ensureV2(); qa.navigate(Screen.Programs)
            val folder = qa.model.folders.first { it.text("name").startsWith("QA графики · Программа") }
            val day = qa.model.templates.first { it.optInt("folder") == folder.getInt("id") && it.array("template_exercises").size >= 3 }
            templateId = day.getInt("id"); originalOrder = day.array("template_exercises").map { it.getInt("id") }
            qa.selectProgram(folder.getInt("id"))
            fun openEditor() {
                qa.visible(hasContentDescription("Настроить шаблон") and hasAnyAncestor(hasTestTag("program-day-$templateId")), "QA day settings").performClick()
                compose.onNodeWithText("Изменить день", substring = false).performClick()
            }
            openEditor()
            compose.onNodeWithTag("day-editor-list").performScrollToIndex(1)
            val first = compose.onNodeWithTag("day-order-${originalOrder[0]}").fetchSemanticsNode().boundsInRoot
            val second = compose.onNodeWithTag("day-order-${originalOrder[1]}").fetchSemanticsNode().boundsInRoot
            compose.onNodeWithTag("drag-exercise-${originalOrder[0]}").performTouchInput { swipe(center, center + Offset(0f, second.center.y - first.center.y + 12f), 700) }
            compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            val expected = originalOrder.toMutableList().apply { add(1, removeAt(0)) }
            val serverDay = api.call("/api/programs/templates/$templateId/") as JSONObject
            assertEquals(expected, serverDay.array("template_exercises").map { it.getInt("id") })
            openEditor()
            compose.onNodeWithTag("day-editor-list").performScrollToIndex(1)
            compose.onNodeWithTag("day-order-${originalOrder[0]}").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Позиция 2 из ${originalOrder.size}"))
            qa.capture("polish-live-day-order")
            compose.onNodeWithText("Отмена", substring = false).performClick()
            verified = true
        } finally {
            try {
                if (templateId != null && originalOrder.isNotEmpty()) {
                    val current = api.call("/api/programs/templates/$templateId/") as JSONObject
                    check(current.array("template_exercises").map { it.getInt("id") }.toSet() == originalOrder.toSet())
                    api.call("/api/programs/template-exercises/reorder/", "POST", obj("template" to templateId, "order" to JSONArray(originalOrder)))
                    val restored = api.call("/api/programs/templates/$templateId/") as JSONObject
                    assertEquals(originalOrder, restored.array("template_exercises").map { it.getInt("id") })
                    if (verified) qa.report("polish-live-day-order", obj("server_persisted" to true, "reopened" to true, "original_order_restored" to true))
                }
            } finally { compose.runOnIdle { qa.model.logout(); store.write(originalSession); compose.activity.viewModelStore.clear() } }
        }
    }
}
