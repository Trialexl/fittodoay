package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.Assume.assumeTrue
import androidx.test.platform.app.InstrumentationRegistry

class AuthScreenTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun signInAndRegistrationAreNativeAndNavigable() {
        assumeTrue("This screen test requires a signed-out emulator; it never clears an existing session",
            SessionStore(InstrumentationRegistry.getInstrumentation().targetContext).read().isEmpty())
        compose.onNodeWithText("С возвращением").assertIsDisplayed()
        compose.onNodeWithText("Войти").assertIsNotEnabled()
        compose.onNodeWithText("Нет аккаунта? Зарегистрироваться").performScrollTo().performClick()
        compose.onNodeWithText("Регистрация · шаг 1 из 3").assertIsDisplayed()
        compose.onNodeWithText("Email").performTextInput("android-test@example.com")
        compose.onNodeWithText("Пароль").performTextInput("test-password-only")
        compose.onNodeWithText("Далее").performScrollTo().performClick()
        compose.onNodeWithText("Возраст").performScrollTo().assertIsDisplayed()
    }
}
