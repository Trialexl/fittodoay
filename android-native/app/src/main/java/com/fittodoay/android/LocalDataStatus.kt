package com.fittodoay.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable fun LocalDataStatus(model: AppModel) {
    val context = LocalContext.current
    val files by produceState(0 to 0L, model.token, model.localSyncResult, model.localSyncing) {
        value = withContext(Dispatchers.IO) { LocalMediaStore(context, model.token).statistics() }
    }
    Panel("Данные на устройстве") {
        Text("Программы, история, профиль, переписка и результаты проверки техники сохраняются в приложении. Музыка требует интернета.")
        if (model.localSyncing) LinearProgressIndicator(androidx.compose.ui.Modifier.fillMaxWidth())
        if (model.localSyncMessage.isNotBlank()) Text(model.localSyncMessage)
        else Text(if (model.localSyncResult.optBoolean("complete")) "Локальная копия обновлена" else "Для полной копии дождитесь первой загрузки всех разделов.")
        if (model.localSyncResult.has("finished_at")) Text("Последнее обновление: " + java.text.DateFormat.getDateTimeInstance().format(java.util.Date(model.localSyncResult.getLong("finished_at"))))
        Text("Сохранено файлов: ${files.first} · ${"%.1f".format(files.second / 1048576.0)} МБ")
        Button(onClick = { model.synchronizeLocalData(force = true) }, enabled = !model.localSyncing && !model.busy) { Text("Обновить локальную копию") }
        if (model.localSyncing) TextButton(onClick = model::pauseLocalSync) { Text("Приостановить") }
    }
}
