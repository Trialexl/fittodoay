import 'package:flutter/material.dart';

class AppPalette {
  static const background = Color(0xFF0f172a);
  static const surface = Color(0xFF0b1224);
  static const card = Color(0xFF111827);
  static const accent = Color(0xFF22d3ee);
  static const border = Color(0xFF1e293b);
  static const textPrimary = Color(0xFFf8fafc);
  static const textSecondary = Color(0xFFcbd5f5);
  static const muted = Color(0xFF94a3b8);
}

class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

ThemeData buildTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppPalette.background,
    colorScheme: ColorScheme.dark(
      background: AppPalette.background,
      primary: AppPalette.accent,
      secondary: AppPalette.accent,
      surface: AppPalette.card,
      onPrimary: AppPalette.background,
      onBackground: AppPalette.textPrimary,
      onSurface: AppPalette.textPrimary,
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: AppPalette.textSecondary, height: 1.4),
      titleMedium: TextStyle(color: AppPalette.textPrimary, fontWeight: FontWeight.w700),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppPalette.card,
      elevation: 0,
      foregroundColor: AppPalette.textPrimary,
    ),
    cardColor: AppPalette.card,
  );
}
