package com.fittodoay.android

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.*
import androidx.compose.ui.text.style.TextDecoration
import org.json.JSONObject

data class ExerciseMention(val start: Int, val end: Int, val source: JSONObject)

private fun mentionText(value: String): Pair<String, List<Int>> {
    val text = StringBuilder(); val indexes = mutableListOf<Int>()
    value.forEachIndexed { index, char ->
        if (char.isLetterOrDigit()) { text.append(char.lowercaseChar().let { if (it == 'ё') 'е' else it }); indexes += index }
        else if (text.isNotEmpty() && text.last() != ' ') { text.append(' '); indexes += index }
    }
    return text.toString().trimEnd() to indexes
}

/** Same word boundaries, case, ё/е and separator normalization as web mentions. */
fun exerciseMentions(text: String, references: List<JSONObject>): List<ExerciseMention> {
    val (normalized, positions) = mentionText(text)
    val aliases = references.flatMap { ref ->
        val source = ref.optJSONObject("exercise") ?: ref.optJSONObject("custom_exercise") ?: ref
        val names = listOf(source.text("name"), source.text("english_name"), ref.text("exercise_name")) +
            source.optJSONArray("aliases")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
        names.flatMap { listOf(it) + domainExerciseAliases(it) }.map { mentionText(it).first }
            .filter { it.length >= 4 }.distinct().map { it to source }
    }
    val matches = aliases.flatMap { (alias, source) ->
        val found = mutableListOf<ExerciseMention>(); var cursor = 0
        while (cursor < normalized.length) {
            val start = normalized.indexOf(alias, cursor); if (start < 0) break
            val end = start + alias.length
            if ((start == 0 || normalized[start - 1] == ' ') && (end == normalized.length || normalized[end] == ' '))
                found += ExerciseMention(positions[start], positions[end - 1] + 1, source)
            cursor = start + 1
        }
        found
    }.sortedWith(compareBy<ExerciseMention> { it.start }.thenByDescending { it.end - it.start })
    var end = 0
    return matches.filter { if (it.start < end) false else { end = it.end; true } }
}

private fun domainExerciseAliases(name: String): List<String> {
    val value = mentionText(name).first
    return buildList {
        if ("жим арнольда" in value) addAll(listOf("Арнольд-жим", "Арнольд жим"))
        if ("махи гантелями стоя" in value || "side lateral raise" in value) addAll(listOf("Махи гантелями в стороны", "Махи гантелями в стороны стоя"))
        if ("махи гантелями стоя" in value) addAll(listOf("Боковые махи гантелями", "Боковые подъемы гантелей", "Боковые подъемы гантелей стоя"))
        if ("dumbbell upright row" in value || "upright dumbbell row" in value) addAll(listOf("Тяга гантелей к подбородку", "Тяга гантелей к подбородку стоя", "Вертикальная тяга гантелей"))
        if ("upright barbell row" in value || "barbell upright row" in value) addAll(listOf("Тяга штанги к подбородку", "Вертикальная тяга штанги"))
        if ("upright cable row" in value || "cable upright row" in value) addAll(listOf("Тяга блока к подбородку", "Тяга нижнего блока к подбородку"))
        if ("barbell deadlift" in value || "становая тяга со штангой" in value) addAll(listOf("Становая тяга", "Классическая становая тяга"))
        if (listOf("stiff legged", "stiff leg", "romanian deadlift", "становая на прямых ногах").any { it in value }) addAll(listOf("Становая тяга на прямых ногах", "Становая на прямых ногах"))
        if ("hyperextensions" in value || "гиперэкстензии" in value) addAll(listOf("Гиперэкстензия", "Гиперэкстензия вертикальная"))
        if ("reverse hyperextension" in value) addAll(listOf("Обратная гиперэкстензия", "Гиперэкстензия обратная"))
    }
}

@Composable fun ExerciseMentionText(message: JSONObject, references: List<JSONObject>, open: (JSONObject) -> Unit) {
    val text = message.text("content")
    val mentions = remember(text, message.text("role"), references) {
        if (message.text("role") == "assistant") exerciseMentions(text, references) else emptyList()
    }
    val color = MaterialTheme.colorScheme.primary
    val annotated = buildAnnotatedString {
        append(text)
        mentions.forEach { mention ->
            addLink(LinkAnnotation.Clickable("exercise-${mention.start}", TextLinkStyles(SpanStyle(color = color, textDecoration = TextDecoration.Underline))) { open(mention.source) }, mention.start, mention.end)
        }
    }
    Text(annotated, style = MaterialTheme.typography.bodyMedium)
}
