package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Host chooses phone/tablet dimensions before starting this suite. */
class LayoutParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun everyNativeRouteRemainsUsableInV2() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("layoutParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        val saved = qa.api.call("/api/profile/preferences/") as JSONObject
        val size = args.getString("layoutName") ?: "device"
        try {
            for (design in listOf("v2")) {
                compose.runOnIdle { qa.model.preferences(obj("design_version" to design)) }; qa.waitRequest()
                for (screen in Screen.entries) {
                    qa.navigate(screen)
                    compose.onNodeWithTag("page-scroll").assertIsDisplayed()
                    val root = compose.onRoot().fetchSemanticsNode().boundsInRoot
                    val page = compose.onNodeWithTag("page-scroll").fetchSemanticsNode().boundsInRoot
                    assertTrue(page.width > 0 && page.width <= root.width && page.height > 0)
                    qa.capture("layout-$size-$design-${screen.name.lowercase()}")
                }
            }
            qa.navigate(Screen.Settings)
            qa.visible("Свой цвет #RRGGBB").performTextReplacement("#123456")
            qa.visible("Применить цвет").performClick(); qa.waitRequest()
            assertEquals("#123456", (qa.api.call("/api/profile/preferences/") as JSONObject).text("accent_color"))
            qa.report("layout-$size", obj("result" to "passed", "routes" to Screen.entries.size, "designs" to 1, "design" to "v2", "custom_accent_persisted" to true))
        } finally {
            qa.api.call("/api/profile/preferences/", "PUT", saved)
            compose.runOnIdle { qa.model.refresh() }; qa.waitRequest()
        }
    }
}
