import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';

void main() {
  runApp(const ProviderScope(child: FitTodoayApp()));
}

class FitTodoayApp extends StatelessWidget {
  const FitTodoayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'fitTODOay',
      theme: buildTheme(),
      routerConfig: appRouter,
    );
  }
}
