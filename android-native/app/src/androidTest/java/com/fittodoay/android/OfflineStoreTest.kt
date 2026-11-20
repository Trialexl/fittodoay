package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class OfflineStoreTest {
    @Test fun repeatedEditsKeepTheOriginalServerValueForCancellation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = OfflineStore(context, UUID.randomUUID().toString())
        val original = obj("id" to 7, "actual_reps" to 10)
        store.enqueue("edit", "/api/workouts/logs/7/", "PATCH", "2026-11-19", obj("actual_reps" to 11), original)
        store.enqueue("edit", "/api/workouts/logs/", "POST", "2026-11-19", obj("actual_reps" to 12))
        assertEquals(10, store.queue().single().getJSONObject("original").getInt("actual_reps"))
        assertEquals(12, store.queue().single().getJSONObject("body").getInt("actual_reps"))
        store.remove("edit")
    }
    @Test fun pendingSetsSurviveRecreationAndRemainIsolatedPerAccount() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val token = UUID.randomUUID().toString()
        val first = OfflineStore(context, token)
        first.enqueue("set:1:2:1", "/api/workouts/logs/", "POST", "2026-11-19", obj("actual_reps" to 10))
        first.enqueue("set:1:2:1", "/api/workouts/logs/", "POST", "2026-11-19", obj("actual_reps" to 12))
        val recreated = OfflineStore(context, token)
        assertEquals(1, recreated.queue().size)
        assertEquals(12, recreated.queue().single().getJSONObject("body").getInt("actual_reps"))
        assertTrue(OfflineStore(context, UUID.randomUUID().toString()).queue().isEmpty())
        recreated.remove("set:1:2:1")
        assertTrue(first.queue().isEmpty())
    }
}
