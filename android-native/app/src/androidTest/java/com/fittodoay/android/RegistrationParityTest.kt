package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.util.UUID

class RegistrationParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun nativeOnboardingPersistsProfileWithCommaDecimals() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("registrationParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        val store = SessionStore(qa.context); val original = store.read()
        try {
            compose.runOnIdle { qa.model.logout() }
            compose.onNodeWithText("Нет аккаунта? Зарегистрироваться").performScrollTo().performClick()
            compose.onNodeWithText("Email").performTextInput("android-registration-${UUID.randomUUID().toString().take(8)}@example.invalid")
            compose.onNodeWithText("Пароль").performTextInput(UUID.randomUUID().toString() + "Aa1!")
            compose.activityRule.scenario.recreate()
            compose.runOnIdle { qa.model = compose.activity.model }
            assertTrue(qa.model.authPasswordDraft.isNotEmpty())
            compose.onNodeWithText("Далее").performScrollTo().performClick()
            compose.onNodeWithText("Возраст").performTextInput("30")
            compose.onNodeWithText("Вес, кг").performTextInput("80,5")
            compose.onNodeWithText("Рост, см").performTextInput("180,5")
            compose.onNodeWithText("Далее").performScrollTo().performClick()
            compose.onNodeWithText("Доступное оборудование").performTextInput("Гантели")
            compose.onNodeWithText("Пожелания к расписанию").performTextInput("Синтетическая проверка регистрации Android")
            compose.onNodeWithText("Зарегистрироваться", substring = false).performScrollTo().performClick(); qa.waitRequest()
            assertTrue(qa.model.token.isNotEmpty())
            qa.ensureV2()
            qa.navigate(Screen.Settings)
            assertEquals(80.5, qa.model.profile.getDouble("weight_kg"), 0.001)
            assertEquals(180.5, qa.model.profile.getDouble("height_cm"), 0.001)
            assertEquals("Гантели", qa.model.profile.text("equipment"))
            qa.capture("registration-profile")
            qa.report("registration", obj("result" to "passed", "onboarding_steps" to 3, "comma_decimals" to true))
        } finally {
            compose.runOnIdle { qa.model.logout(); store.write(original); compose.activity.viewModelStore.clear() }
            compose.activityRule.scenario.recreate()
        }
    }
}
