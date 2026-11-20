package com.fittodoay.android

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assume.assumeTrue

/** Screenshots use the same synthetic identity as the browser, never a personal account. */
class VisualReferenceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun captureAllRoutesUsingTheWebReferenceAccount() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("visualReference") == "true")
        val email = requireNotNull(args.getString("qaEmail"))
        check(email.startsWith("android-cross-") && email.endsWith("@example.invalid"))
        val qa = QaHarness(compose); qa.guard()
        val store = SessionStore(qa.context); val originalToken = store.read()
        val login = Api { "" }.call("/api/auth/login/", "POST", obj("email" to email, "password" to requireNotNull(args.getString("qaPassword")))) as JSONObject
        val referenceToken = login.getString("token")
        val referenceApi = Api { referenceToken }
        val saved = (referenceApi.call("/api/profile/preferences/") as JSONObject).put("design_version", "v2")
        try {
            compose.runOnIdle { qa.model.logout(); store.write(referenceToken); compose.activity.viewModelStore.clear() }
            compose.activityRule.scenario.recreate()
            compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest()
            for (design in listOf("v2")) {
                compose.runOnIdle { qa.model.preferences(obj("design_version" to design, "theme" to "light", "accent_color" to "#a855f7")) }; qa.waitRequest()
                for (screen in Screen.entries) {
                    qa.navigate(screen)
                    qa.capture("reference-$design-${screen.name.lowercase()}")
                }
            }
            qa.report("visual-reference", obj("result" to "captured", "routes" to Screen.entries.size, "designs" to 1, "design" to "v2", "same_account_as_browser" to true))
        } finally {
            try { referenceApi.call("/api/profile/preferences/", "PUT", saved) }
            finally {
                compose.runOnIdle { qa.model.logout(); store.write(originalToken); compose.activity.viewModelStore.clear() }
                // The rule closes this activity immediately after the test. Restore
                // storage now; the next normal launch loads the original QA session.
                // Recreating again here races the rule's final lifecycle transition.
            }
        }
    }
}
