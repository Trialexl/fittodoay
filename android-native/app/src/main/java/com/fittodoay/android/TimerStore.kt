package com.fittodoay.android

import android.app.*
import android.content.*
import android.media.AudioAttributes
import androidx.core.net.toUri
import android.os.*
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

class TimerStore(private val context: Context, token: String) {
    private val suffix = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }
    private val prefs = context.getSharedPreferences("timers-$suffix", Context.MODE_PRIVATE)
    private val alarms = context.getSystemService(AlarmManager::class.java)
    fun read(kind: String): JSONObject? = prefs.getString(kind, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    private fun pending(kind: String) = PendingIntent.getBroadcast(context, if (kind == "rest") 601 else 602,
        Intent(context, TimerReceiver::class.java).putExtra("kind", kind), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun save(kind: String, endAt: Long, state: JSONObject) {
        val payload = JSONObject(state.toString()).put("end_at", endAt).put("id", UUID.randomUUID().toString()).put("notified", false)
        check(prefs.edit().putString(kind, payload.toString()).commit())
        val action = pending(kind)
        if (endAt <= 0) { alarms.cancel(action); return }
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, action)
        else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, action)
    }
    // Update form/window state without changing the deadline, alarm or signal identity.
    fun update(kind: String, changes: JSONObject) {
        val state = read(kind) ?: return
        changes.keys().forEach { key -> state.put(key, changes.get(key)) }
        check(prefs.edit().putString(kind, state.toString()).commit())
    }
    fun clear(kind: String, dismissSignal: Boolean = false) {
        val completed = read(kind)?.optBoolean("notified") == true
        prefs.edit().remove(kind).commit(); alarms.cancel(pending(kind))
        // Finishing a timer clears its state immediately; cancelling its notification would cut off the sound.
        if (dismissSignal || !completed) context.getSystemService(NotificationManager::class.java).cancel(if (kind == "rest") 601 else 602)
    }
    fun claimSignal(kind: String, id: String): Boolean = synchronized(lock) {
        val value = read(kind) ?: return@synchronized false
        if (value.text("id") != id || value.optBoolean("notified") || value.optLong("end_at") > System.currentTimeMillis()) return@synchronized false
        check(prefs.edit().putString(kind, value.put("notified", true).toString()).commit()); true
    }
    companion object { private val lock = Any() }
}

class TimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val token = SessionStore(context).read(); if (token.isEmpty()) return
        val kind = intent.getStringExtra("kind") ?: return
        val store = TimerStore(context, token); val state = store.read(kind) ?: return
        if (store.claimSignal(kind, state.text("id"))) signal(context, kind)
    }
    companion object {
        fun signal(context: Context, kind: String) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val sound = "android.resource://${context.packageName}/raw/timer_complete".toUri()
            val channel = NotificationChannel("workout-timer-signals", "Сигналы таймеров тренировки", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 120, 80, 180, 80, 240)
            }
            manager.createNotificationChannel(channel)
            val content = PendingIntent.getActivity(context, 600, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = Notification.Builder(context, "workout-timer-signals").setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(if (kind == "rest") "Отдых завершён" else "Время упражнения истекло")
                .setContentText("Вернитесь к тренировке").setContentIntent(content).setAutoCancel(true).build()
            if (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                // SystemUI owns notification audio focus, including when this application is in the background.
                // Honor a channel muted by the user; never add a second independently played beep.
                manager.notify(if (kind == "rest") 601 else 602, notification)
            } else {
                TimerSignalAudio.play(context)
                context.getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
    }
}
