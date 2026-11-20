package com.fittodoay.android

import android.Manifest
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

@Composable fun TimerPermissionsPanel() {
    val context = LocalContext.current
    var notifications by remember { mutableStateOf(Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { notifications = it }
    Panel("Таймеры в фоне") {
        Text(if (notifications) "Уведомления разрешены" else "Уведомления выключены: приложение покажет завершение таймера при открытии.")
        if (!notifications && Build.VERSION.SDK_INT >= 33) TextButton(onClick = { permission.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Разрешить уведомления") }
        val exact = Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
        Text(if (exact) "Точный сигнал завершения разрешён" else "Android может задержать сигнал в фоне. Разрешите точные таймеры для сигнала в назначенное время.")
        if (!exact && Build.VERSION.SDK_INT >= 31) TextButton(onClick = {
            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
        }) { Text("Настроить точные таймеры") }
    }
}
