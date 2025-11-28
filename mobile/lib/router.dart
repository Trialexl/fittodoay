import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'screens/analytics_screen.dart';
import 'screens/assistant_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/programs_screen.dart';
import 'screens/workout_screen.dart';
import 'widgets/shell_scaffold.dart';

final appRouter = GoRouter(
  initialLocation: '/programs',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) => ShellScaffold(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/programs',
              name: 'programs',
              builder: (context, state) => const ProgramsScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/workout',
              name: 'workout',
              builder: (context, state) => const WorkoutScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/analytics',
              name: 'analytics',
              builder: (context, state) => const AnalyticsScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/assistant',
              name: 'assistant',
              builder: (context, state) => const AssistantScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/profile',
              name: 'profile',
              builder: (context, state) => const ProfileScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: Center(child: Text('Route not found: ${state.uri.toString()}')),
  ),
);
