package com.fittodoay.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.core.view.WindowCompat
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.lifecycle.viewmodel.compose.viewModel
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    val model: AppModel by lazy(LazyThreadSafetyMode.NONE) { androidx.lifecycle.ViewModelProvider(this)[AppModel::class.java] }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { FitApp(model) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun FitApp(model: AppModel = viewModel()) {
    val dark = model.preferences.text("theme") == "dark"
    val modern = model.preferences.text("design_version", "v1") == "v2"
    var menu by remember { mutableStateOf(false) }
    val view = LocalView.current
    SideEffect {
        val activity = view.context as? android.app.Activity
        if (activity != null) WindowCompat.getInsetsController(activity.window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
    val accent = runCatching { Color(android.graphics.Color.parseColor(model.preferences.text("accent_color", "#a855f7"))) }
        .getOrDefault(Color(0xffa855f7))
    val scheme = fitColors(dark, accent, modern)
    MaterialTheme(colorScheme = scheme, typography = FitTypography, shapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp), extraLarge = RoundedCornerShape(24.dp))) {
        Scaffold(
            topBar = {
                TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = scheme.surface), title = {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("fitTOD", fontWeight = FontWeight.Bold, fontSize = 20.sp, letterSpacing = (-.8).sp)
                        Icon(Icons.Outlined.CheckCircle, null, tint = accent, modifier = Modifier.size(19.dp))
                        Text("ay", fontSize = 20.sp, letterSpacing = (-.8).sp)
                    }
                },
                    actions = { if (model.token.isNotEmpty()) {
                        IconButton(onClick = model::refresh, enabled = !model.busy) { Icon(Icons.Outlined.Refresh, "Обновить", Modifier.size(20.dp)) }
                        if (modern) IconButton(onClick = { model.navigate(Screen.Settings) }, enabled = !model.busy) { Icon(Icons.Outlined.Tune, "Профиль", Modifier.size(20.dp)) }
                        if (!modern) {
                            IconButton(onClick = { menu = true }, enabled = !model.busy) { Icon(Icons.Outlined.Menu, "Меню") }
                            DropdownMenu(menu, { menu = false }) {
                                Screen.entries.forEach { target -> DropdownMenuItem(text = { Text(target.title) }, onClick = { menu = false; model.navigate(target) }, modifier = Modifier.semantics { contentDescription = target.title }) }
                            }
                        }
                    } })
            },
            bottomBar = {
                if (model.token.isNotEmpty()) {
                    val icons = listOf(Icons.Outlined.CheckCircle, Icons.Outlined.Folder, Icons.Outlined.BarChart, Icons.Outlined.Videocam, Icons.Outlined.AutoAwesome, Icons.Outlined.Person)
                    Column(Modifier.navigationBarsPadding()) {
                    MiniPlayer(model)
                    if (modern) NavigationBar(containerColor = scheme.surface, tonalElevation = 0.dp, modifier = Modifier.height(64.dp).testTag("bottom-navigation"), windowInsets = WindowInsets(0, 0, 0, 0)) { Screen.entries.filter { it != Screen.Settings }.forEachIndexed { i, screen ->
                        NavigationBarItem(selected = screen == model.screen, enabled = !model.busy,
                            modifier = Modifier.semantics { contentDescription = screen.title },
                            onClick = { model.navigate(screen) }, icon = { Icon(icons[i], null, Modifier.size(21.dp)) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = accent.copy(alpha = .09f), selectedIconColor = accent, selectedTextColor = scheme.onSurface, unselectedIconColor = scheme.onSurfaceVariant),
                            label = { Text(when(screen) { Screen.Workout -> "Сегодня"; Screen.Programs -> "Планы"; Screen.Analytics -> "Прогресс"; else -> screen.title }, maxLines = 1, fontSize = 9.sp) }, alwaysShowLabel = true)
                    } }
                    }
                }
            }
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (model.pendingCount > 0) Text("Ожидают синхронизации: ${model.pendingCount}", Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                model.error?.let { message ->
                    Surface(color = MaterialTheme.colorScheme.errorContainer) {
                        Row(Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(message, Modifier.weight(1f)); TextButton(onClick = { model.error = null }) { Text("Закрыть") }
                        }
                    }
                }
                model.notice?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary) }
                if (model.token.isEmpty()) AuthScreen(model) else when (model.screen) {
                    Screen.Workout -> WorkoutScreen(model)
                    Screen.Programs -> ProgramsScreen(model)
                    Screen.Analytics -> AnalyticsScreen(model)
                    Screen.Technique -> TechniqueScreen(model)
                    Screen.Assistant -> AssistantScreen(model)
                    Screen.Settings -> SettingsScreen(model)
                }
            }
        }
        TimerDialogs(model)
    }
}

@Composable fun Page(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 960.dp).fillMaxSize().testTag("page-scroll").verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp), content = content)
    }
}
@Composable fun Panel(title: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    FitCard(modifier) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
    }
}
@Composable fun Field(label: String, value: String, onChange: (String) -> Unit, password: Boolean = false) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true, shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant, unfocusedBorderColor = MaterialTheme.colorScheme.outline),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = when {
            password -> androidx.compose.ui.text.input.KeyboardType.Password
            label == "Email" -> androidx.compose.ui.text.input.KeyboardType.Email
            else -> androidx.compose.ui.text.input.KeyboardType.Text
        }),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
}
@Composable fun Choices(label: String, value: String, options: List<Pair<String, String>>, onChange: (String) -> Unit) {
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (id, text) -> FilterChip(selected = value == id, onClick = { onChange(id) }, label = { Text(text) }) }
        }
    }
}
@Composable fun Action(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth().heightIn(min = 44.dp), enabled = enabled, shape = RoundedCornerShape(12.dp)) { Text(label) }
}
@Composable fun ConfirmDelete(title: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Удалить $title?") }, text = { Text("Это действие изменит данные на сервере.") },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text("Удалить") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } })
}
val goals = listOf("strength" to "Сила", "hypertrophy" to "Мышцы", "cut" to "Рельеф", "endurance" to "Выносливость")
val genders = listOf("male" to "Мужской", "female" to "Женский", "other" to "Другое")
val levels = listOf("beginner" to "Новичок", "intermediate" to "Средний", "advanced" to "Опытный")

@Composable fun AuthScreen(model: AppModel) {
    var register by rememberSaveable { mutableStateOf(false) }
    var step by rememberSaveable { mutableIntStateOf(0) }
    var email by rememberSaveable { mutableStateOf("") }
    val password = model.authPasswordDraft
    var gender by rememberSaveable { mutableStateOf("male") }
    var goal by rememberSaveable { mutableStateOf("strength") }
    var level by rememberSaveable { mutableStateOf("beginner") }
    var age by rememberSaveable { mutableStateOf("") }
    var weight by rememberSaveable { mutableStateOf("") }
    var height by rememberSaveable { mutableStateOf("") }
    var equipment by rememberSaveable { mutableStateOf("") }
    var health by rememberSaveable { mutableStateOf("") }
    var schedule by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(register, password) { if (register && step > 0 && password.isEmpty()) step = 0 }
    Page {
        Text(if (register) "Создайте свой профиль" else "С возвращением", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Программы, тренировки и прогресс — в одном месте.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Panel(if (register) "Регистрация · шаг ${step + 1} из 3" else "Вход") {
            if (!register || step == 0) {
                Field("Email", email, { email = it }); Field("Пароль", password, { model.authPasswordDraft = it }, true)
            } else if (step == 1) {
                Choices("Пол", gender, genders) { gender = it }
                Field("Возраст", age, { age = it }); Field("Вес, кг", weight, { weight = it }); Field("Рост, см", height, { height = it })
                Choices("Цель", goal, goals) { goal = it }; Choices("Опыт", level, levels) { level = it }
            } else {
                Field("Доступное оборудование", equipment, { equipment = it }); Field("Ограничения здоровья", health, { health = it }); Field("Пожелания к расписанию", schedule, { schedule = it })
            }
            if (register && step < 2) Action("Далее", !model.busy && (step != 0 || (email.contains('@') && password.length >= 8))) { step++ }
            else Action(if (register) "Зарегистрироваться" else "Войти", !model.busy && email.contains('@') && password.isNotEmpty()) {
                if (register && (age.toIntOrNull() == null || weight.replace(',', '.').toDoubleOrNull() == null || height.replace(',', '.').toDoubleOrNull() == null)) model.error = "Заполните возраст, вес и рост"
                else model.auth(email, password, if (!register) null else obj("gender" to gender, "age" to age.toIntOrNull(), "weight_kg" to weight.replace(',', '.').toDoubleOrNull(),
                    "height_cm" to height.replace(',', '.').toDoubleOrNull(), "goal" to goal, "level" to level, "equipment" to equipment,
                    "health_limitations" to health, "preferred_schedule_notes" to schedule))
            }
            if (register && step > 0) TextButton(onClick = { step-- }) { Text("Назад") }
        }
        TextButton(onClick = { register = !register; step = 0 }, enabled = !model.busy) { Text(if (register) "Уже есть аккаунт? Войти" else "Нет аккаунта? Зарегистрироваться") }
    }
}
