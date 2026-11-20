package com.fittodoay.android

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

@Composable fun McpPanel() {
    val context = LocalContext.current
    val url = BuildConfig.SERVER_URL + "/mcp"
    var copied by remember { mutableStateOf(false) }
    Panel("Подключение Fittoday по MCP") {
        Text("Адрес MCP-сервера")
        Text(url, style = MaterialTheme.typography.bodyMedium)
        TextButton(onClick = {
            context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Fittoday MCP", url)); copied = true
        }) { Text(if (copied) "Скопировано" else "Скопировать адрес") }
        Text("В настройках MCP вашего ИИ-приложения добавьте сервер Fittoday типа Streamable HTTP с этим адресом. Подключение использует OAuth: выполните Authenticate и подтвердите запрошенные права на странице Fittoday.")
        Text("Пароль и API-токен в настройки MCP вставлять не нужно.", style = MaterialTheme.typography.bodySmall)
    }
}
