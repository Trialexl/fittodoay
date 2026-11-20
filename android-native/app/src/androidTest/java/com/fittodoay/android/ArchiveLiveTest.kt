package com.fittodoay.android

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Deployment regression: never substitutes a cached response for a missing server route. */
class ArchiveLiveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun deployedArchiveRoutesAndPaginationMatchNativeClient() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("archiveLive") == "true")
        val qa = QaHarness(compose); qa.guard()
        val custom = qa.api.call("/api/exercises/custom/").rows()
        val counts = obj("custom_exercises" to custom.size)
        for (path in listOf("/api/llm-agent/threads/", "/api/technique-reviews/")) {
            val first = qa.api.call("${path}?limit=1") as JSONObject
            assertTrue("Pagination contract missing for $path", first.has("next") && first.has("items"))
            assertTrue(first.array("items").size <= 1)
            val next = first.text("next")
            assertTrue("Pagination must stay on the current HTTPS API", next.isBlank() || next.startsWith(path))
            val paginated = qa.api.all("${path}?limit=1").rows()
            val normal = qa.api.all(path).rows()
            assertEquals(normal.map { it.getInt("id") }.toSet(), paginated.map { it.getInt("id") }.toSet())
            assertEquals(paginated.size, paginated.map { it.getInt("id") }.distinct().size)
            counts.put(path, paginated.size)
        }
        qa.report("deployed-archive-contract", counts.put("result", "passed"))
    }
}
