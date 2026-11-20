package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Uses a dedicated cross-client identity; restores the enrolled QA session afterwards. */
class CrossClientParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun loginAndBuildSharedFixtureThroughNativeControls() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("crossClient") == "true")
        val qa = QaHarness(compose); qa.guard()
        val session = SessionStore(qa.context); val original = session.read()
        try {
            compose.runOnIdle { qa.model.logout() }
            compose.onNodeWithText("Email").performTextInput(requireNotNull(args.getString("qaEmail")))
            compose.onNodeWithText("Пароль").performTextInput("invalid-password-for-negative-test")
            compose.onNodeWithText("Войти", substring = false).performScrollTo().performClick(); qa.waitRequest(true)
            assertTrue(qa.model.token.isEmpty()); assertNotNull(qa.model.error)
            compose.onNodeWithText("Пароль").performTextReplacement(requireNotNull(args.getString("qaPassword")))
            compose.onNodeWithText("Войти", substring = false).performScrollTo().performClick(); qa.waitRequest()
            assertTrue(qa.model.token.isNotEmpty())
            qa.ensureV2()
            qa.navigate(Screen.Programs)
            if (qa.model.folders.none { it.text("name") == "Сверка Android и Web" }) {
                qa.visible("Новая программа").performClick()
                compose.onNodeWithText("Название", substring = false).performTextInput("Сверка Android и Web")
                compose.onNodeWithText("Комментарий", substring = false).performTextInput("Создано нативным интерфейсом для проверки двух клиентов")
                compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            }
            val folder = qa.model.folders.first { it.text("name") == "Сверка Android и Web" }
            qa.selectProgram(folder.getInt("id"))
            val folderTag = hasTestTag("program-${folder.getInt("id")}")
            if (qa.model.templates.none { it.optInt("folder") == folder.optInt("id") }) {
                qa.visible(hasText("Добавить день", substring = false) and hasAnyAncestor(folderTag), "add day").performClick()
                compose.onNodeWithText("Название", substring = false).performTextInput("Общий тестовый день")
                compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            }
            val day = qa.model.templates.first { it.optInt("folder") == folder.optInt("id") }
            if (day.array("template_exercises").isEmpty()) {
                qa.visible(hasText("+ Добавить упражнение", substring = false) and hasAnyAncestor(folderTag), "add exercise").performClick(); qa.waitRequest()
                compose.onNodeWithText("Поиск в каталоге").performTextInput("Spell Caster")
                compose.onNodeWithText("Найти", substring = false).performClick(); qa.waitRequest()
                compose.onNode(hasText("Spell Caster", substring = false) and hasClickAction() and !hasSetTextAction()).performScrollTo().performClick()
                compose.onNodeWithText("Подходы", substring = false).performTextReplacement("2")
                compose.onNodeWithText("Повторы", substring = false).performTextReplacement("10")
                compose.onNodeWithText("Вес, кг", substring = false).performTextReplacement("5,5")
                compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            }
            val current = qa.api.call("/api/programs/templates/${day.getInt("id")}/") as JSONObject
            val expectedWeight = args.getString("qaExpectedWeight")?.toDouble() ?: 5.5
            assertEquals(expectedWeight, current.array("template_exercises").first().getDouble("weight_override"), 0.001)
            if (args.getString("crossRecord") == "true") {
                // Compare the already verified shared workout, whose weekly
                // schedule need not include the host's current weekday.
                val referenceDate = qa.api.call("/api/analytics/days/").rows()
                    .filter { it.optDouble("load") > 0 }.maxByOrNull { it.text("date") }?.text("date")
                if (referenceDate != null) compose.runOnIdle { qa.model.date = java.time.LocalDate.parse(referenceDate).toString() }
                qa.navigate(Screen.Workout)
                if (qa.model.plan.array("logs").isEmpty()) {
                    qa.visible("Выполнено").performClick(); qa.waitRequest()
                    compose.onNodeWithText("Продолжить тренировку").performClick(); compose.waitForIdle()
                }
                compose.onNode(hasText("Вес, кг", substring = false) and hasAnyAncestor(hasTestTag("body-weight-panel"))).performScrollTo().performTextReplacement("81,25")
                qa.visible(hasContentDescription("Сохранить вес"), "save weight").performClick(); qa.waitRequest()
                assertEquals(81.25, qa.model.plan.getJSONObject("weigh_in").getDouble("weight_kg"), 0.001)
            }
            for (screen in Screen.entries) { qa.navigate(screen); qa.capture("cross-${screen.name.lowercase()}") }
            qa.report("cross-client", obj("result" to "passed", "program_id" to folder.getInt("id"), "day_id" to day.getInt("id"), "weight" to expectedWeight, "negative_login" to true))
        } finally {
            compose.runOnIdle { qa.model.logout(); session.write(original); compose.activity.viewModelStore.clear() }
            compose.activityRule.scenario.recreate()
        }
    }
}
