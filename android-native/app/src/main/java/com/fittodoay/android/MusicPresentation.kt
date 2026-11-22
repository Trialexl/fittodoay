package com.fittodoay.android

import org.json.JSONObject
import java.util.Locale

fun musicGrouping(value: String) = value.takeIf { it in setOf("folder", "artist", "album", "none") } ?: "folder"

/** Same folders as the web player, without storage prefixes or platform separators. */
fun musicFolderLabel(track: JSONObject): String {
    if (track.text("source_type") == "stream") return "Радио · ${if (track.text("stream_category") == "relax") "Релакс" else "Тренировка"}"
    val folders = track.text("filename").replace('\\', '/').split('/').map(String::trim).filter(String::isNotEmpty).dropLast(1)
    if (folders.isEmpty()) return "Без папки"
    val technical = folders.first() == "system" || folders.first().matches(Regex("user_\\d+", RegexOption.IGNORE_CASE))
    if (folders.size == 1 && technical) return if (folders.first() == "system") "Системные" else "Мои треки"
    return (if (technical) folders.drop(1) else folders).joinToString(" / ") { part ->
        part.replace(Regex("[_-]+"), " ").trim().split(Regex("\\s+")).joinToString(" ") { word -> word.replaceFirstChar { it.titlecase(Locale.forLanguageTag("ru")) } }
    }
}
