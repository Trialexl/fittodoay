package com.fittodoay.android

import org.junit.Test
import org.junit.Assert.*

class ExerciseMentionTest {
    private val press = obj("id" to "press", "name" to "Жим лёжа", "english_name" to "Bench press")
    @Test fun matchesCaseSeparatorsAndYoWhilePreservingOriginalText() {
        val text = "Сначала ЖИМ_ЛЕЖА, затем bench-press."
        val matches = exerciseMentions(text, listOf(obj("exercise" to press)))
        assertEquals(listOf("ЖИМ_ЛЕЖА", "bench-press"), matches.map { text.substring(it.start, it.end) })
        assertTrue(matches.all { it.source === press })
    }
    @Test fun longerMentionWinsAndPartsOfWordsAreNotLinks() {
        val long = obj("id" to "long", "name" to "Жим лежа узким хватом")
        val matches = exerciseMentions("Жим лежа узким хватом и преджим лежа", listOf(press, long))
        assertEquals(1, matches.size); assertEquals("long", matches.single().source.text("id"))
    }
    @Test fun customExerciseAndWebDomainAliasAreResolved() {
        val custom = obj("id" to 9, "name" to "Свой подъём")
        val aliases = exerciseMentions("Свой подъем, затем Арнольд-жим", listOf(obj("custom_exercise" to custom), obj("exercise" to obj("id" to "arnold", "name" to "Жим Арнольда с гантелями"))))
        assertEquals(listOf("9", "arnold"), aliases.map { it.source.text("id") })
    }
}
