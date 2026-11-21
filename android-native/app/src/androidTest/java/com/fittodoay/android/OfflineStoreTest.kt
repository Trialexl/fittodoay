package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class OfflineStoreTest {
    @Test fun legacyQueueAndPlansImportIntoRoomOnceWithoutLosingPendingWrites() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val token = "room-import:${UUID.randomUUID()}"; val date = "2026-11-19"
        val old = context.getSharedPreferences("offline-${localAccountKey(token)}", android.content.Context.MODE_PRIVATE)
        val entry = obj("key" to "set:1:2:1", "date" to date, "method" to "POST", "path" to "/api/workouts/logs/", "body" to obj("actual_reps" to 10))
        assertTrue(old.edit().putString("queue", org.json.JSONArray().put(entry).toString()).putString("plan-$date", obj("date" to date, "id" to 1).toString()).commit())
        val imported = OfflineStore(context, token)
        assertEquals(1, imported.plan(date)!!.getInt("id")); assertEquals(10, imported.queue().single().getJSONObject("body").getInt("actual_reps"))
        imported.remove(entry.getString("key"))
        assertTrue("The legacy recovery copy must not resurrect removed entries", OfflineStore(context, token).queue().isEmpty())
        old.edit().clear().commit()
    }
    @Test fun lateAcknowledgementCannotRemoveANewerEditAndDeleteIsProjectedLocally() {
        val store = OfflineStore(InstrumentationRegistry.getInstrumentation().targetContext, "outbox-test:${UUID.randomUUID()}")
        val date = "2026-11-19"; val key = "set:1:2:1"
        val body = obj("workout_day" to 1, "template_exercise" to 2, "set_index" to 1, "actual_reps" to 10)
        store.stage(key, "/api/workouts/logs/", "POST", date, body, null, obj("date" to date, "logs" to org.json.JSONArray()))
        val first = store.queue().single()
        store.stage(key, "/api/workouts/logs/", "POST", date, obj("workout_day" to 1, "template_exercise" to 2, "set_index" to 1, "actual_reps" to 12), null, store.plan(date)!!)
        assertNull(store.accept(first, org.json.JSONObject(body.toString()).put("id", 7)))
        assertEquals(12, store.queue().single().getJSONObject("body").getInt("actual_reps"))
        val newest = store.queue().single()
        assertEquals(12, store.accept(newest, org.json.JSONObject(newest.getJSONObject("body").toString()).put("id", 7))!!.array("logs").single().getInt("actual_reps"))
        assertTrue(store.queue().isEmpty()); assertEquals(7, store.plan(date)!!.array("logs").single().getInt("id"))
        store.stage(key, "/api/workouts/logs/7/", "DELETE", date, body, null, store.plan(date)!!)
        assertTrue(store.plan(date)!!.array("logs").isEmpty())
        store.accept(store.queue().single(), org.json.JSONObject())
        assertTrue(store.queue().isEmpty()); assertTrue(store.plan(date)!!.array("logs").isEmpty())
    }
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
