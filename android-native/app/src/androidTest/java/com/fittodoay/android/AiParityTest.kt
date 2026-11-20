package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

@OptIn(ExperimentalTestApi::class)
class AiParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val qa by lazy { QaHarness(compose) }
    @Before fun guard() { assumeTrue(InstrumentationRegistry.getArguments().getString("aiParity") == "true"); qa.guard() }
    @Test fun shiftEnterKeepsDraftEnterSendsOnceAndCancelPreservesProgram() = runBlocking<Unit> {
        val folder = qa.api.call("/api/programs/folders/").rows().first { it.text("name") == "Android QA" }
        val day = qa.api.call("/api/programs/templates/?folder=${folder.getInt("id")}").rows().first()
        val exercise = day.array("template_exercises").first()
        val original = exercise.getDouble("weight_override")
        qa.navigate(Screen.Programs); qa.selectProgram(folder.getInt("id"))
        qa.visible(hasText("AI", substring = false) and hasAnyAncestor(hasTestTag("program-${folder.getInt("id")}")), "program chat").performClick(); qa.waitRequest()
        val before = qa.model.messages.maxOfOrNull { it.optInt("id") } ?: 0
        val field = compose.onNodeWithText("Сообщение", substring = false)
        field.performTextInput("Я явно прошу вручную изменить только вес упражнения ${exercise.getJSONObject("exercise").text("name")} в дне ${day.text("name")} на ${original + 1} кг после моего подтверждения.")
        field.performKeyInput { keyDown(androidx.compose.ui.input.key.Key.ShiftLeft); pressKey(androidx.compose.ui.input.key.Key.Enter); keyUp(androidx.compose.ui.input.key.Key.ShiftLeft) }
        compose.waitForIdle()
        val draft = field.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.EditableText].text
        assertTrue(draft.contains('\n')); assertEquals(before, qa.model.messages.maxOfOrNull { it.optInt("id") } ?: 0)
        field.performTextInput("Подходы и повторы не меняй. Подготовь предложение, пока ничего не применяй.")
        field.performKeyInput { pressKey(androidx.compose.ui.input.key.Key.Enter) }; qa.waitRequest()
        val sent = qa.model.messages.filter { it.optInt("id") > before && it.text("role") == "user" }
        qa.report("ai-enter-delta", obj("before_max_id" to before, "messages" to org.json.JSONArray(sent)))
        assertEquals(1, sent.size)
        val proposal = qa.model.messages.last { it.text("role") == "assistant" }
        qa.report("ai-cancel-proposal", proposal)
        assertEquals("pending", proposal.text("proposal_status"))
        compose.onNodeWithText("Отклонить", substring = false).performScrollTo().performClick(); qa.waitRequest()
        assertEquals("cancelled", qa.model.messages.first { it.optInt("id") == proposal.getInt("id") }.text("proposal_status"))
        val after = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
        assertEquals(original, after.array("template_exercises").first { it.optInt("id") == exercise.optInt("id") }.getDouble("weight_override"), .001)
        qa.capture("ai-cancelled")
        qa.report("ai-cancel-keyboard", obj("result" to "passed", "shift_enter_newline" to true, "enter_sends_once" to true, "cancel_keeps_program" to true))
    }
    @Test fun previewAndConfirmedGenerationMatchServerPrograms() = runBlocking<Unit> {
        val savedPreferences = qa.api.call("/api/profile/preferences/") as JSONObject
        val previous = qa.api.call("/api/programs/folders/").rows()
        try {
            qa.navigate(Screen.Assistant)
            qa.visible("Далее").performClick()
            compose.onNodeWithText("Что в приоритете", substring = false).assertExists()
            qa.visible("Далее").performClick()
            compose.onNodeWithText("Тренировок в неделю").performTextReplacement("1")
            compose.onNodeWithText("Длительность тренировки, мин").performTextReplacement("30")
            qa.visible("Далее").performClick()
            compose.onNodeWithText("Оборудование, ограничения, пожелания").performTextInput("Тест Android: нужна одна программа, один день, два упражнения с гантелями. Два подхода на упражнение. Уровень новичок. Гантели — единственное доступное оборудование.")
            qa.visible("Подготовить программу").performClick(); qa.waitRequest()
            val preview = requireNotNull(qa.model.preview)
            qa.report("ai-preview-plan", preview)
            assertTrue(preview.getJSONObject("plan").array("programs").isNotEmpty())
            val afterPreview = qa.api.call("/api/programs/folders/").rows()
            assertEquals(previous.map { it.getInt("id") }.toSet(), afterPreview.map { it.getInt("id") }.toSet())
            qa.capture("ai-preview")
            qa.visible("Создать эти программы").performClick(); qa.waitRequest()
            assertEquals(Screen.Programs, qa.model.screen)
            val generated = qa.model.folders.filter { folder -> previous.none { it.optInt("id") == folder.optInt("id") } }
            assertEquals(1, generated.size)
            val days = qa.api.call("/api/programs/templates/?folder=${generated.single().getInt("id")}").rows()
            assertTrue(days.isNotEmpty() && days.all { it.array("template_exercises").isNotEmpty() })
            for (exercise in days.flatMap { it.array("template_exercises") }) {
                val id = exercise.getJSONObject("exercise").text("id")
                val detail = qa.api.call("/api/exercises/${java.net.URLEncoder.encode(id, "UTF-8")}/") as JSONObject
                assertEquals(id, detail.text("id"))
            }
            qa.capture("ai-created-program")
            // Replaying a confirmed draft must return the existing program, not create another one.
            qa.api.call("/api/llm-agent/programs/drafts/${preview.getString("draft_id")}/apply/", "POST")
            assertEquals(afterPreview.size + 1, qa.api.call("/api/programs/folders/").rows().size)
            qa.report("ai-generation", obj("result" to "passed", "program_id" to generated.single().getInt("id"), "days" to days.size, "draft_replay_without_duplicates" to true))
        } catch (error: Exception) {
            qa.report("ai-generation-failure", obj("error" to error.toString(), "model_error" to qa.model.error))
            throw error
        } finally {
            val current = qa.api.call("/api/programs/folders/").rows()
            for (folder in current) {
                val active = previous.firstOrNull { it.optInt("id") == folder.optInt("id") }?.optBoolean("is_active") ?: false
                qa.api.call("/api/programs/folders/${folder.getInt("id")}/", "PATCH", obj("is_active" to active))
            }
            qa.api.call("/api/profile/preferences/", "PUT", savedPreferences)
            compose.runOnIdle { qa.model.refresh() }; qa.waitRequest()
        }
    }
    @Test fun nativePendingProposalAppliesOnlyAfterConfirmation() = runBlocking<Unit> {
        val folder = qa.api.call("/api/programs/folders/").rows().first { it.text("name") == "Android QA" }
        val day = qa.api.call("/api/programs/templates/?folder=${folder.getInt("id")}").rows().first()
        val exercise = day.array("template_exercises").first()
        val originalWeight = exercise.opt("weight_override")
        val source = exercise.getJSONObject("exercise")
        val targetWeight = if (exercise.optDouble("weight_override", 5.0) == 6.0) 7 else 6
        try {
            qa.navigate(Screen.Programs); qa.selectProgram(folder.getInt("id"))
            qa.visible(hasText("AI", substring = false) and hasAnyAncestor(hasTestTag("program-${folder.getInt("id")}")), "QA program AI").performClick(); qa.waitRequest()
            compose.onNodeWithText("Сообщение", substring = false).performTextInput("Измени только вес упражнения ${source.text("name")} в дне ${day.text("name")} на $targetWeight кг. Подходы, повторы и другие упражнения не меняй. Предложи изменение для моего подтверждения.")
            compose.onNodeWithText("Отправить").performClick(); qa.waitRequest()
            val proposal = qa.model.messages.last { it.text("role") == "assistant" }
            qa.report("ai-proposal-response", proposal)
            assertEquals("pending", proposal.text("proposal_status"))
            assertTrue(proposal.array("actions").isNotEmpty())
            val beforeApply = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
            assertEquals(originalWeight?.toString(), beforeApply.array("template_exercises").first { it.optInt("id") == exercise.optInt("id") }.opt("weight_override")?.toString())
            qa.capture("ai-pending")
            compose.onNodeWithText("Применить изменения", substring = false).performScrollTo().performClick(); qa.waitRequest()
            val afterApply = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
            assertEquals(targetWeight.toDouble(), afterApply.array("template_exercises").first { it.optInt("id") == exercise.optInt("id") }.getDouble("weight_override"), 0.001)
            qa.capture("ai-applied"); compose.onNodeWithText("Закрыть", substring = false).performClick()
            qa.report("ai-confirmation", obj("result" to "passed", "program_id" to folder.getInt("id"), "message_id" to proposal.getInt("id"), "target_weight" to targetWeight))
        } finally {
            qa.api.call("/api/programs/template-exercises/${exercise.getInt("id")}/", "PATCH", obj("exercise_id" to source.get("id"), "weight_override" to originalWeight))
        }
    }
}
