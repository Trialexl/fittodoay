package com.fittodoay.android

import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Read-only archive download on the enrolled QA account; no generation or mutation requests. */
class ArchiveWorkerLiveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun archiveContinuesAfterViewModelDisposalAndReportsThroughWorkManager() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("archiveWorker") == "true")
        val qa = QaHarness(compose); qa.guard()
        val started = System.currentTimeMillis()
        compose.runOnIdle { qa.model.synchronizeLocalData(force = true) }
        compose.waitUntil(15_000) { qa.model.localSyncing }
        compose.runOnIdle { compose.activity.viewModelStore.clear() }
        compose.activityRule.scenario.recreate()
        compose.runOnIdle { qa.model = compose.activity.model }
        compose.waitUntil(240_000) { !qa.model.localSyncing && qa.model.localSyncResult.optLong("finished_at") > started }
        val result = qa.model.localSyncResult
        qa.report("refinement-archive-worker", result)
        assertTrue("The full QA archive must finish: ${result.array("failures")}", result.optBoolean("complete"))
        assertTrue(result.optInt("responses") > 0)
        qa.navigate(Screen.Settings)
        qa.visible("Данные на устройстве").performScrollTo()
        qa.capture("refinement-archive-status")
    }
}
