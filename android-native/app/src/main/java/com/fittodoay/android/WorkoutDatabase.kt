package com.fittodoay.android

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "workout_plans", primaryKeys = ["account", "date"])
data class StoredWorkoutPlan(val account: String, val date: String, val json: String)

@Entity(tableName = "workout_outbox", primaryKeys = ["account", "key"], indices = [Index(value = ["account", "position"])])
data class StoredWorkoutWrite(val account: String, val key: String, val position: Long, val json: String)

@Entity(tableName = "workout_imports")
data class ImportedWorkoutAccount(@PrimaryKey val account: String)

@Dao interface WorkoutDao {
    @Query("SELECT json FROM workout_plans WHERE account=:account AND date=:date") fun plan(account: String, date: String): String?
    @Upsert fun cache(plan: StoredWorkoutPlan)
    @Query("SELECT * FROM workout_outbox WHERE account=:account ORDER BY position") fun queue(account: String): List<StoredWorkoutWrite>
    @Upsert fun put(write: StoredWorkoutWrite)
    @Query("DELETE FROM workout_outbox WHERE account=:account AND `key`=:key") fun remove(account: String, key: String)
    @Query("SELECT COUNT(*) FROM workout_outbox WHERE account=:account") fun observePending(account: String): Flow<Int>
    @Query("SELECT EXISTS(SELECT 1 FROM workout_imports WHERE account=:account)") fun imported(account: String): Boolean
    @Insert fun imported(account: ImportedWorkoutAccount)
}

@Database(entities = [StoredWorkoutPlan::class, StoredWorkoutWrite::class, ImportedWorkoutAccount::class], version = 1, exportSchema = true)
abstract class WorkoutDatabase : RoomDatabase() {
    abstract fun workouts(): WorkoutDao
    companion object {
        @Volatile private var instance: WorkoutDatabase? = null
        fun get(context: Context): WorkoutDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, WorkoutDatabase::class.java, "workout-state.db")
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING).build().also { instance = it }
        }
    }
}
