package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.time.LocalDate
import java.util.UUID

class ProgramCrudParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun folderDaySchedulesValidationAndDeletion() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("programParity") == "true")
        val qa = QaHarness(compose); qa.guard(); qa.navigate(Screen.Programs)
        val name = "QA расписания ${UUID.randomUUID().toString().take(6)}"
        var folderId: Int? = null
        fun dialog(text: String) = compose.onNode(hasText(text, substring = false) and hasAnyAncestor(isDialog()))
        try {
            qa.visible("Новая программа").performClick(); dialog("Название").performTextInput(name)
            dialog("Сохранить").performClick(); qa.waitRequest()
            folderId = qa.model.folders.first { it.text("name") == name }.getInt("id")
            qa.selectProgram(requireNotNull(folderId))
            val tag = hasTestTag("program-$folderId")
            qa.visible(hasText("Добавить день", substring = false) and hasAnyAncestor(tag), "add scheduled day").performClick()
            dialog("Название").performTextInput("QA расписание")
            dialog("Сохранить").performClick(); qa.waitRequest()
            var day = qa.model.templates.first { it.optInt("folder") == folderId }
            assertEquals("weekly", day.text("schedule_type"))
            for ((choice, type) in listOf("Раз в N недель" to "biweekly", "Через X дней" to "interval", "Даты" to "custom", "По неделям" to "weekly")) {
                qa.visible(hasText("Изменить день", substring = false) and hasAnyAncestor(tag), "edit schedule").performClick()
                dialog(choice).performScrollTo().performClick()
                if (type in listOf("biweekly", "interval")) {
                    dialog("Интервал").performScrollTo().performTextReplacement("0")
                    dialog("Сохранить").performClick(); compose.waitForIdle()
                    assertNotNull(qa.model.error); dialog("День тренировки").assertExists()
                    val unchanged = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
                    assertEquals(day.text("schedule_type"), unchanged.text("schedule_type"))
                    dialog("Интервал").performTextReplacement("2")
                }
                if (type == "custom") dialog("Даты через запятую ГГГГ-ММ-ДД").performScrollTo().performTextReplacement(LocalDate.now().toString())
                dialog("Сохранить").performClick(); qa.waitRequest()
                day = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
                assertEquals(type, day.text("schedule_type"))
            }
            qa.capture("program-schedules")
            // Delete through the native confirmation dialog, then verify the server.
            qa.visible(hasText("Удалить", substring = false) and hasAnyAncestor(tag), "delete QA folder").performClick()
            dialog("Удалить").performClick(); qa.waitRequest()
            assertTrue(qa.api.call("/api/programs/folders/").rows().none { it.optInt("id") == folderId })
            folderId = null
            qa.report("program-crud", obj("result" to "passed", "schedule_types" to 4, "invalid_interval_preserves_dialog" to true, "delete_confirmation" to true))
        } finally { folderId?.let { qa.api.call("/api/programs/folders/$it/", "DELETE") } }
    }
}
