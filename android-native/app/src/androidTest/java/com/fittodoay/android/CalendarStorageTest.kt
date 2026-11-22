package com.fittodoay.android

import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import java.util.UUID

/** Unique synthetic accounts and a private migration database; never uses a signed-in account. */
class CalendarStorageTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun anOlderHttpResponseCannotOverwriteANewerArchive() = runBlocking(Dispatchers.IO) {
        val store = LocalDataStore(context, "calendar-storage:${UUID.randomUUID()}")
        val path = "/api/analytics/days/?start=2026-11-01&end=2026-11-30"
        store.writeSnapshot(path, obj("items" to JSONArray().put(obj("date" to "2026-11-22", "load" to 120))), 200)
        store.writeSnapshot(path, obj("items" to JSONArray().put(obj("date" to "2026-11-22", "load" to 100))), 100)
        assertEquals(120, store.read(path)!!.rows().single().getInt("load"))
        store.writeSnapshot("local:all:/api/analytics/days/", obj("items" to JSONArray().put(obj("date" to "2026-11-22", "load" to 140))), 300)
        assertEquals(140, store.snapshot(path)!!.value.rows().single().getInt("load"))
        assertEquals(300L, store.snapshot(path)!!.asOf)
    }
    @Test fun roomHistoryIncludesDurableEditsAndAcknowledgements() = runBlocking(Dispatchers.IO) {
        val store = OfflineStore(context, "calendar-history:${UUID.randomUUID()}")
        val date = "2026-11-22"
        val plan = obj("date" to date, "id" to 77, "logs" to JSONArray())
        val body = obj("workout_day" to 77, "template_exercise" to 3, "set_index" to 1, "actual_reps" to 6, "actual_weight" to 20)
        store.stage("set:77:3:1", "/api/workouts/logs/", "POST", date, body, null, plan)
        val pending = withTimeout(5000) { store.observeHistory(date, date).first() }
        assertTrue(date in pending.pendingDates)
        assertEquals(120.0, calendarLoads(null, pending)[date]!!, .001)
        store.accept(store.queue().single(), JSONObject(body.toString()).put("id", 99))
        val accepted = withTimeout(5000) { store.observeHistory(date, date).first() }
        assertTrue(accepted.pendingDates.isEmpty())
        assertTrue(accepted.days.getValue(date).updatedAt > 0)
        assertEquals(120.0, calendarLoads(StoredResponse(obj("items" to JSONArray().put(obj("date" to date, "load" to 0))), 1), accepted)[date]!!, .001)
    }
    @Test fun versionTwoMigrationPreservesPlansQueueAndDrafts() = runBlocking(Dispatchers.IO) {
        val name = "calendar-migration-${UUID.randomUUID()}.db"
        val schema = JSONObject(InstrumentationRegistry.getInstrumentation().context.assets.open("com.fittodoay.android.WorkoutDatabase/2.json").bufferedReader().use { it.readText() }).getJSONObject("database")
        val file = context.getDatabasePath(name).apply { parentFile!!.mkdirs() }
        SQLiteDatabase.openOrCreateDatabase(file, null).use { old ->
            schema.getJSONArray("entities").objects().forEach { entity ->
                val table = entity.getString("tableName")
                old.execSQL(entity.getString("createSql").replace("\u0024{TABLE_NAME}", table))
                entity.optJSONArray("indices")?.objects()?.forEach { index -> old.execSQL(index.getString("createSql").replace("\u0024{TABLE_NAME}", table)) }
            }
            val queries = schema.getJSONArray("setupQueries")
            for (i in 0 until queries.length()) old.execSQL(queries.getString(i))
            old.execSQL("INSERT INTO workout_plans VALUES(?,?,?)", arrayOf("qa", "2026-11-22", "{\"logs\":[]}"))
            old.execSQL("INSERT INTO workout_outbox VALUES(?,?,?,?)", arrayOf<Any>("qa", "one", 0, "{}"))
            old.execSQL("INSERT INTO local_drafts VALUES(?,?,?)", arrayOf("qa", "draft", "{}"))
            old.version = 2
        }
        val migrated = Room.databaseBuilder(context, WorkoutDatabase::class.java, name).build()
        try {
            assertEquals("{\"logs\":[]}", migrated.workouts().plan("qa", "2026-11-22"))
            assertEquals(0L, migrated.workouts().plans("qa", "2026-11-01", "2026-11-30").single().updatedAt)
            assertEquals(1, migrated.workouts().queue("qa").size)
            assertEquals(1, migrated.drafts().all("qa").size)
        } finally { migrated.close(); context.deleteDatabase(name) }
    }
}
