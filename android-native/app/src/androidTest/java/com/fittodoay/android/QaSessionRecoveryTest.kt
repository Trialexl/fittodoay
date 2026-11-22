package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Test
import org.junit.Assume.assumeTrue
import org.junit.Assert.assertEquals
import java.io.File

/** Restore a verified enrolled QA session after the host interrupts a cross-client run. */
class QaSessionRecoveryTest {
    @Test fun restoreOnlyTheKnownCrossClientQaSession() = runBlocking<Unit> {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("recoverQa") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        val backup = JSONObject(File(context.filesDir, "qa-enrolled-session.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == backup.text("session_digest"))
        val store = SessionStore(context)
        val sessionValue = store.read()
        val current = localAccountKey(sessionValue)
        if (current != marker.text("session_digest")) {
            // Real server tokens are hex; these colon-prefixed values exist
            // only in the isolated tests and can be left by a terminated AVD.
            if (!sessionValue.startsWith("polish:") && !sessionValue.startsWith("polish-network:") && !sessionValue.startsWith("refinement:")) {
                val email = requireNotNull(args.getString("qaEmail"))
                check(email.startsWith("android-cross-") && email.endsWith("@example.invalid"))
                val login = Api { "" }.call("/api/auth/login/", "POST", obj("email" to email, "password" to requireNotNull(args.getString("qaPassword")))) as JSONObject
                check(localAccountKey(login.getString("token")) == current) { "Refusing to replace a session unrelated to the known cross-client QA account" }
            }
            check(context.getSharedPreferences("session", android.content.Context.MODE_PRIVATE).edit().putString("token", backup.getString("encrypted_token")).commit())
        }
        assertEquals(marker.text("session_digest"), localAccountKey(store.read()))
    }
}
