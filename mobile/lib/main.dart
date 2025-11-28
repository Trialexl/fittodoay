import 'package:flutter/material.dart';

import 'screens/assistant_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/programs_screen.dart';
import 'screens/workout_screen.dart';
import 'theme.dart';

void main() {
  runApp(const FitTodoayApp());
}

class FitTodoayApp extends StatefulWidget {
  const FitTodoayApp({super.key});

  @override
  State<FitTodoayApp> createState() => _FitTodoayAppState();
}

class _FitTodoayAppState extends State<FitTodoayApp> {
  int _selectedIndex = 0;

  final _pages = const [
    ProgramsScreen(),
    WorkoutScreen(),
    AnalyticsScreen(),
    AssistantScreen(),
    ProfileScreen(),
  ];

  final _labels = const ["Программы", "Тренировка", "Аналитика", "Ассистент", "Профиль"];

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'fitTODOay',
      theme: buildTheme(),
      home: Scaffold(
        body: SafeArea(child: _pages[_selectedIndex]),
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _selectedIndex,
          type: BottomNavigationBarType.fixed,
          selectedItemColor: AppPalette.accent,
          unselectedItemColor: AppPalette.textSecondary,
          backgroundColor: AppPalette.card,
          onTap: (index) => setState(() => _selectedIndex = index),
          items: [
            for (final label in _labels)
              BottomNavigationBarItem(icon: const SizedBox.shrink(), label: label),
          ],
        ),
      ),
    );
  }
}
