package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.util.UUID

/** Never skipped for an incompatible server when explicitly included in the full parity run. */
class CustomExerciseParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun customExerciseCollectionAndNativeCreation() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("customParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        qa.api.call("/api/exercises/custom/") // A 404 here means the required server route fix is not deployed.
        val name = "QA своё ${UUID.randomUUID().toString().take(8)}"
        val folder = qa.api.call("/api/programs/folders/", "POST", obj("name" to name)) as JSONObject
        var customId: Int? = null
        try {
            qa.api.call("/api/programs/templates/", "POST", obj("folder" to folder.getInt("id"), "name" to "QA день", "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to org.json.JSONArray().put(0))))
            qa.navigate(Screen.Programs); qa.selectProgram(folder.getInt("id"))
            qa.visible(hasContentDescription("Добавить упражнение") and hasAnyAncestor(hasTestTag("program-${folder.getInt("id")}")), "custom exercise dialog").performClick(); qa.waitRequest()
            compose.onNodeWithText("Мои", substring = false).performScrollTo().performClick(); qa.waitRequest()
            compose.onNodeWithText("Создать своё упражнение", substring = false).performScrollTo().performClick()
            compose.onNodeWithText("Название", substring = false).performTextInput(name)
            compose.onNodeWithText("Мышцы", substring = false).performTextInput("Biceps")
            compose.onNodeWithText("Создать", substring = false).performClick(); qa.waitRequest()
            val custom = qa.api.call("/api/exercises/custom/").rows().single { it.text("name") == name }; customId = custom.getInt("id")
            compose.onNode(hasText(name, substring = false) and hasAnyAncestor(isDialog()) and hasClickAction()).performScrollTo().performClick()
            compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            val day = qa.api.call("/api/programs/templates/?folder=${folder.getInt("id")}").rows().single()
            assertEquals(customId, day.array("template_exercises").single().getJSONObject("custom_exercise").getInt("id"))
            qa.report("custom-exercise", obj("result" to "passed", "native_create_and_attach" to true))
        } finally {
            qa.api.call("/api/programs/folders/${folder.getInt("id")}/", "DELETE")
            customId?.let { qa.api.call("/api/exercises/custom/$it/", "DELETE") }
        }
    }
}
