package com.fittodoay.android

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlin.math.*
import org.json.JSONObject

private val TimerInk = Color(0xfff4f6fa)
private val TimerMuted = Color(0xff8f9aae)
private val ExecutionAccent = Color(0xffa9e7c7)
private fun clock(seconds: Int) = "${seconds.coerceAtLeast(0) / 60}:${(seconds.coerceAtLeast(0) % 60).toString().padStart(2, '0')}"
@Composable private fun remaining(end: Long): Int {
    val seconds by produceState(initialValue = ceil((end - System.currentTimeMillis()) / 1000.0).toInt().coerceAtLeast(0), end) {
        while (true) { value = ceil((end - System.currentTimeMillis()) / 1000.0).toInt().coerceAtLeast(0); delay(200) }
    }
    return seconds
}
private fun timerExercise(state: JSONObject?) = state?.optJSONObject("exercise")?.optJSONObject("source")?.text("name").orEmpty()

/** Material owns the progress ring; the web V2 tick marks remain decorative. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun TimerDial(seconds: Int, duration: Int, accent: Color, modifier: Modifier, mini: Boolean = false, digits: Int = 62) {
    val fraction by animateFloatAsState(if (duration > 0) (seconds.toFloat() / duration).coerceIn(0f, 1f) else 0f, tween(900, easing = LinearEasing), label = "timer-progress")
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val unit = size.minDimension / 320f
            val center = Offset(size.width / 2, size.height / 2)
            fun at(radius: Float, angle: Double) = center + Offset((cos(angle) * radius * unit).toFloat(), (sin(angle) * radius * unit).toFloat())
            if (!mini) repeat(60) { i ->
                val angle = Math.toRadians(i * 6.0 - 90)
                drawLine(if (i % 5 == 0) Color(0x38ffffff) else Color(0x19ffffff), at(151f, angle), at(if (i % 5 == 0) 142f else 146f, angle), (if (i % 5 == 0) 1.5f else 1f) * unit)
            }
        }
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val diameter = minOf(maxWidth, maxHeight)
            CircularProgressIndicator(progress = { fraction }, modifier = Modifier.size(diameter * (if (mini) .8375f else .803125f)),
                color = accent, trackColor = Color(0x09ffffff), strokeWidth = diameter * (if (mini) .05f else .015625f), strokeCap = StrokeCap.Round, gapSize = 0.dp)
        }

        if (!mini) Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(clock(seconds), color = TimerInk, fontSize = (if (clock(seconds).length > 5) 40 else digits).sp,
                lineHeight = (if (clock(seconds).length > 5) 46 else (digits * 1.15).toInt()).sp, fontWeight = FontWeight(450), letterSpacing = (-3).sp, modifier = Modifier.testTag("workout-timer-clock").semantics { contentDescription = "Осталось $seconds секунд" })
            Text("осталось времени", color = Color(0xffa2aec1), lineHeight = 14.sp, fontSize = 10.sp)
            Spacer(Modifier.height(12.dp))
            Text("из ${clock(duration)}", color = Color(0xff667286), lineHeight = 14.sp, fontSize = 9.sp)
        }
    }
}
@Composable private fun TimerWindowButton(description: String, click: () -> Unit, icon: androidx.compose.ui.graphics.vector.ImageVector, text: String? = null) {
    Surface(onClick = click, shape = RoundedCornerShape(12.dp), color = Color(0x04ffffff), border = BorderStroke(1.dp, Color(0x1affffff)),
        modifier = Modifier.height(40.dp).widthIn(min = 40.dp).semantics { contentDescription = description }) {
        Row(Modifier.padding(horizontal = if (text != null) 12.dp else 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, Modifier.size(18.dp), tint = Color(0xffc4cbd8))
            if (text != null) Text(text, lineHeight = 18.sp, fontSize = 11.sp, color = Color(0xffc4cbd8))
        }
    }
}
@Composable fun MinimizedWorkoutTimer(model: AppModel) {
    if (!model.workoutTimerActive || !model.timerCollapsed) return
    val execution = model.executionUntil > 0
    val state = if (execution) model.executionState() else model.restPending
    val seconds = remaining(if (execution) model.executionUntil else model.restUntil)
    val duration = if (execution) state?.text("time")?.toIntOrNull() ?: 1 else model.restDuration
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("minimized-workout-timer"),
        shape = RoundedCornerShape(16.dp), color = Color(0xff171d2a).copy(alpha = .94f), contentColor = TimerInk, border = BorderStroke(1.dp, Color(0x26ffffff))) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TimerDial(seconds, duration, MaterialTheme.colorScheme.primary, Modifier.size(38.dp), mini = true)
            Column(Modifier.weight(1f).clickable { model.collapseWorkoutTimer(false) }.semantics { contentDescription = "Развернуть таймер" }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(clock(seconds), color = TimerInk, lineHeight = 26.sp, fontSize = 20.sp)
                    Text(if (execution) "выполнение" else "отдых", lineHeight = 14.sp, fontSize = 9.sp, color = Color(0xff8996ad))
                }
                Text(timerExercise(state), lineHeight = 14.sp, fontSize = 10.sp, color = Color(0xff9ba8bc), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TimerWindowButton("Развернуть", { model.collapseWorkoutTimer(false) }, Icons.Outlined.NorthEast)
            TimerWindowButton("Закрыть таймер", model::cancelWorkoutTimer, Icons.Outlined.Close)
        }
    }
}
@Composable fun TimerDialogs(model: AppModel) {
    if (!model.workoutTimerActive || model.timerCollapsed) return
    val execution = model.executionUntil > 0
    val state = if (execution) model.executionState() else model.restPending
    val seconds = remaining(if (execution) model.executionUntil else model.restUntil)
    val duration = if (execution) state?.text("time")?.toIntOrNull() ?: 1 else model.restDuration
    val name = timerExercise(state).ifBlank { "Тренировка" }
    val showClock = execution || duration > 0
    val accent by androidx.compose.animation.animateColorAsState(if (execution) ExecutionAccent else MaterialTheme.colorScheme.primary, tween(240), label = "timer-phase")
    var callout by remember(execution, state?.optJSONObject("set")?.optInt("set_index"), name) { mutableStateOf<String?>(null) }
    LaunchedEffect(execution, seconds, duration, state?.optBoolean("is_final")) {
        when {
            !execution && showClock && state?.optBoolean("is_final") == true -> callout = "На сегодня всё. Ты молодец!"
            execution && seconds == 1 -> callout = "СУПЕР"
            execution && duration >= 10 && seconds == 10 -> callout = "Еще чуть-чуть"
            !execution && seconds == 5 -> callout = "Приготовься"
            !execution && seconds == 1 -> callout = "Давай дальше"
        }
    }
    Dialog(onDismissRequest = model::cancelWorkoutTimer, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnClickOutside = false)) {
        Surface(Modifier.fillMaxSize().testTag("workout-timer-screen"), color = Color(0xff10141d).copy(alpha = .94f), contentColor = TimerInk) {
            BoxWithConstraints(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(accent.copy(alpha = if (execution) .043f else .09f), Color.Transparent), center = Offset(140f, 600f), radius = 800f)).systemBarsPadding().imePadding()) {
                val wide = maxWidth > 820.dp || (maxWidth >= 600.dp && maxHeight <= 500.dp)
                val phoneWidth = maxWidth.value
                Column(Modifier.widthIn(max = 1180.dp).fillMaxSize().align(Alignment.TopCenter).padding(horizontal = if (wide) 40.dp else if (maxWidth <= 360.dp) 16.dp else 22.dp, vertical = 18.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                            Text("fit", color = TimerInk, lineHeight = 24.sp, fontSize = 18.sp, letterSpacing = (-1).sp)
                            Text("TODO", color = TimerInk, lineHeight = 24.sp, fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                            Text("ay", color = TimerInk, lineHeight = 24.sp, fontSize = 18.sp, letterSpacing = (-1).sp); Text(".", color = accent)
                            if (wide) Text("Время для себя", Modifier.padding(start = 20.dp), color = Color(0xff788397), lineHeight = 14.sp, fontSize = 10.sp)
                        }
                        if (!execution && showClock) TimerWindowButton("Свернуть", { model.collapseWorkoutTimer(true) }, Icons.Outlined.SouthWest, "Свернуть")
                        Spacer(Modifier.width(10.dp))
                        TimerWindowButton("Закрыть таймер", model::cancelWorkoutTimer, Icons.Outlined.Close)
                    }
                    val phase: @Composable () -> Unit = {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(6.dp).background(accent, androidx.compose.foundation.shape.CircleShape))
                            Text(if (execution) "Выполнение" else if (showClock) "Восстановление" else "Результат подхода", color = if (execution) accent else Color(0xffb4a1ef), lineHeight = 14.sp, fontSize = 10.sp)
                            if (!execution) state?.optJSONObject("set")?.let { Box(Modifier.width(1.dp).height(12.dp).background(Color(0x24ffffff))); Text("Подход ${it.optInt("set_index")}", lineHeight = 14.sp, fontSize = 10.sp, color = TimerMuted) }
                        }
                    }
                    val title: @Composable () -> Unit = { Text(name, color = TimerInk, lineHeight = if (wide) 39.sp else 30.sp, fontSize = if (wide) 32.sp else if (phoneWidth <= 360) 20.sp else 23.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.7).sp, textAlign = if (wide) TextAlign.Start else TextAlign.Center) }
                    val dial: @Composable () -> Unit = {
                        if (showClock) Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            TimerDial(seconds, duration, accent, Modifier.size(if (wide) 360.dp else (phoneWidth * .66f).coerceAtMost(260f).dp), digits = if (wide) 86 else (phoneWidth * .16f).coerceIn(50f, 68f).toInt())
                            Text(callout ?: if (seconds == 0) if (execution) "Время вышло" else "Отдых завершён" else if (execution) "Держите свой ритм." else "Выдох. И следующий подход.", color = Color(0xff9ba7ba), lineHeight = 18.sp, fontSize = 11.sp)
                        }
                    }
                    val result: @Composable () -> Unit = {
                        if (!execution && state != null) Surface(shape = RoundedCornerShape(18.dp), color = Color(0x03ffffff), border = BorderStroke(1.dp, Color(0x13ffffff)), modifier = Modifier.widthIn(max = 450.dp).fillMaxWidth()) {
                            Column(Modifier.padding(if (phoneWidth <= 360) 13.dp else 16.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Ваш результат", lineHeight = 14.sp, fontSize = 10.sp, color = Color(0xffa0abbd)); Text("Можно изменить", lineHeight = 14.sp, fontSize = 9.sp, color = Color(0xff647086)) }
                                val exercise = state.optJSONObject("exercise") ?: JSONObject(); val defaults = exercise.optJSONObject("defaults") ?: JSONObject(); val source = exercise.optJSONObject("source") ?: JSONObject()
                                val timed = defaults.optBoolean("has_time", source.optBoolean("has_time"))
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    if (timed) WorkoutNumberControl("Время (сек)", state.text("time"), { model.editRest("time", it) }, 1.0, Modifier.weight(1f), enabled = true, compact = phoneWidth <= 360)
                                    else {
                                        WorkoutNumberControl("Повторы", state.text("reps"), { model.editRest("reps", it) }, 1.0, Modifier.weight(1f), enabled = true, compact = phoneWidth <= 360)
                                        if (defaults.optBoolean("has_weight", source.optBoolean("has_weight"))) WorkoutNumberControl("Вес (кг)", state.text("weight"), { model.editRest("weight", it) }, 2.0, Modifier.weight(1f), enabled = true, compact = phoneWidth <= 360)
                                    }
                                }
                            }
                        }
                    }
                    val actions: @Composable () -> Unit = {
                        model.error?.let { Text(it, color = Color(0xfffca5a5), lineHeight = 20.sp, fontSize = 12.sp) }
                        Row(Modifier.widthIn(max = 450.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(onClick = { if (execution) model.finishExecution() else model.finishRest() }, enabled = model.workoutSaving == 0, modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color(0xff101d17))) {
                                Text(if (execution) "Завершить раньше" else if (state == null) "Продолжить тренировку" else if (seconds > 0) "Пропустить отдых" else "Сохранить подход", lineHeight = 20.sp, fontSize = 12.sp)
                                Spacer(Modifier.width(14.dp)); Icon(if (execution) Icons.Outlined.Check else Icons.Outlined.ArrowForward, null, Modifier.size(18.dp))
                            }
                            if (execution) OutlinedButton(onClick = model::cancelWorkoutTimer, modifier = Modifier.heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Color(0x24ffffff)), colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xffbdc7d8))) { Text("Прервать", lineHeight = 20.sp, fontSize = 12.sp) }
                        }
                    }
                    val footnote: @Composable () -> Unit = { Text(if (execution) "При досрочном завершении запишется фактическое время." else if (showClock) "Результат сохранится после завершения отдыха." else "Сохраните результат, чтобы отметить подход.", color = Color(0xff67758b), lineHeight = 14.sp, fontSize = 9.sp, textAlign = if (wide) TextAlign.Start else TextAlign.Center) }
                    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                        if (wide) Row(Modifier.fillMaxWidth().heightIn(min = maxHeight).verticalScroll(rememberScrollState()).padding(vertical = 40.dp), horizontalArrangement = Arrangement.spacedBy(64.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (showClock) Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { dial() }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(20.dp)) { phase(); title(); Text(if (execution) "Сосредоточьтесь на движении. Отсчёт уже идёт." else "Проверьте результат подхода, пока идёт отдых.", color = TimerMuted, lineHeight = 20.sp, fontSize = 12.sp); result(); actions(); footnote() }
                        } else Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = maxHeight).padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
                            phase(); title(); dial(); result(); actions(); footnote()
                        }
                    }
                    HorizontalDivider(color = Color(0x0cffffff))
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(if (execution) "Один подход за раз" else "Пауза — часть прогресса", color = Color(0xff59667b), lineHeight = 12.sp, fontSize = 8.sp)
                        Text(if (showClock) "${clock((duration - seconds).coerceIn(0, duration.coerceAtLeast(0)))} прошло" else "Подход выполнен", color = Color(0xff59667b), lineHeight = 12.sp, fontSize = 8.sp)
                    }
                }
            }
        }
    }
}
