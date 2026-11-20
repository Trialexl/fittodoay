package com.fittodoay.android

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.security.MessageDigest

fun localAccountKey(token: String): String = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }

/** Durable account-isolated application data. Not a size-limited HTTP/image cache. */
class LocalDataStore(context: Context, token: String) : ResponseStorage {
    val account = localAccountKey(token)
    private val db = database(context.applicationContext)
    override fun read(path: String): Any? {
        if (!path.startsWith("local:") && !isLocalDataPath(path)) return null
        return exact(path) ?: localQuery(path, ::exact)
    }
    private fun exact(path: String): Any? = db.readableDatabase.query("responses", arrayOf("json"), "account=? AND path=?", arrayOf(account, path), null, null, null).use {
        if (it.moveToFirst()) parseStoredJson(it.getString(0)) else null
    }
    override fun write(path: String, value: Any) {
        require(path.startsWith("local:") || isLocalDataPath(path)) { "Authentication and music cannot be mirrored" }
        require(value is JSONObject || value is org.json.JSONArray)
        db.writableDatabase.execSQL("INSERT OR REPLACE INTO responses(account,path,json,updated) VALUES(?,?,?,?)",
            arrayOf<Any>(account, path, value.toString(), System.currentTimeMillis()))
    }
    override fun remove(path: String) { db.writableDatabase.delete("responses", "account=? AND path=?", arrayOf(account, path)) }
    override fun recordMutation(path: String, method: String, body: JSONObject?, result: Any) {
        if (!isLocalDataPath(path)) return
        db.writableDatabase.insertOrThrow("changes", null, ContentValues().apply {
            put("account", account); put("path", path); put("method", method); put("body", body?.toString()); put("response", result.toString()); put("created", System.currentTimeMillis())
        })
        if (method == "DELETE") {
            remove(path)
            val collection = path.trimEnd('/').substringBeforeLast('/') + "/"
            val id = path.trimEnd('/').substringAfterLast('/')
            for (key in listOf(collection, "local:archive:$collection")) {
                exact(key)?.let { write(key, org.json.JSONArray(it.rows().filterNot { row -> row.text("id") == id })) }
            }
        } else if (result is JSONObject) {
            if (path == "/api/profile/" || path == "/api/profile/preferences/") write(path, result)
            val collections = setOf("/api/programs/folders/", "/api/programs/templates/", "/api/programs/template-exercises/", "/api/exercises/custom/", "/api/technique-reviews/")
            val collection = collections.firstOrNull { path == it || path.removePrefix(it).trim('/').toIntOrNull() != null && path.startsWith(it) }
            if (collection != null && result.has("id")) {
                write("$collection${result.get("id")}/", result)
                for (key in listOf(collection, "local:archive:$collection")) {
                    exact(key)?.let { old -> write(key, org.json.JSONArray(old.rows().filterNot { it.text("id") == result.text("id") } + result)) }
                }
            }
        }
    }
    fun paths(prefix: String = ""): List<String> = db.readableDatabase.query("responses", arrayOf("path"), "account=? AND path LIKE ?", arrayOf(account, "$prefix%"), null, null, "path").use {
        buildList { while (it.moveToNext()) add(it.getString(0)) }
    }
    fun count(): Int = db.readableDatabase.rawQuery("SELECT COUNT(*) FROM responses WHERE account=?", arrayOf(account)).use { it.moveToFirst(); it.getInt(0) }
    private class Database(context: Context) : SQLiteOpenHelper(context, "fittodoay-local.db", null, 1) {
        override fun onConfigure(db: SQLiteDatabase) { super.onConfigure(db); db.enableWriteAheadLogging() }
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE responses(account TEXT NOT NULL,path TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(account,path))")
            db.execSQL("CREATE TABLE changes(id INTEGER PRIMARY KEY AUTOINCREMENT,account TEXT NOT NULL,path TEXT NOT NULL,method TEXT NOT NULL,body TEXT,response TEXT NOT NULL,created INTEGER NOT NULL)")
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = error("Unsupported local database migration")
    }
    companion object {
        @Volatile private var instance: Database? = null
        private fun database(context: Context): Database = instance ?: synchronized(this) { instance ?: Database(context).also { instance = it } }
    }
}
