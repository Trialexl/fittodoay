package com.fittodoay.android

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

fun scheduleConfig(type: String, weekdays: Set<Int>, start: String, interval: String, dates: String): JSONObject {
    if (type == "weekly" || type == "biweekly") require(weekdays.isNotEmpty() && weekdays.all { it in 0..6 }) { "Выберите дни недели" }
    if (type == "biweekly" || type == "interval") {
        require(runCatching { LocalDate.parse(start) }.isSuccess) { "Укажите дату старта ГГГГ-ММ-ДД" }
        require((interval.toIntOrNull() ?: 0) >= 1) { "Интервал должен быть больше нуля" }
    }
    return when (type) {
        "weekly" -> obj("days_of_week" to JSONArray(weekdays.sorted()))
        "biweekly" -> obj("days_of_week" to JSONArray(weekdays.sorted()), "start_date" to start, "week_interval" to interval.toInt())
        "interval" -> obj("start_date" to start, "every_x_days" to interval.toInt())
        "custom" -> { val parsed = dates.split(',').map(String::trim).filter(String::isNotEmpty).distinct().sorted()
            require(parsed.isNotEmpty() && parsed.all { runCatching { LocalDate.parse(it) }.isSuccess }) { "Укажите даты ГГГГ-ММ-ДД через запятую" }
            obj("specific_dates" to JSONArray(parsed))
        }
        else -> throw IllegalArgumentException("Выберите расписание")
    }
}
