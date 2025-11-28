import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme.dart';

class ShellScaffold extends StatelessWidget {
  const ShellScaffold({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _labels = ["Программы", "Тренировка", "Аналитика", "Ассистент", "Профиль"];

  void _goBranch(int index) {
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: navigationShell.currentIndex,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppPalette.accent,
        unselectedItemColor: AppPalette.textSecondary,
        backgroundColor: AppPalette.card,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        onTap: _goBranch,
        items: [
          for (final label in _labels)
            BottomNavigationBarItem(icon: const SizedBox.shrink(), label: label),
        ],
      ),
    );
  }
}
