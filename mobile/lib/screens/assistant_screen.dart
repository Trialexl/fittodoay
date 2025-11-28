import 'package:flutter/material.dart';

import '../theme.dart';

class AssistantScreen extends StatelessWidget {
  const AssistantScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("LLM Assistant", style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppPalette.textPrimary)),
          const SizedBox(height: AppSpacing.sm),
          const Text(
            "Визард предпочтений, запуск /api/llm-agent/programs/ и просмотр созданных программ.",
            style: TextStyle(color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppPalette.card,
                borderRadius: BorderRadius.circular(AppSpacing.lg),
                border: Border.all(color: AppPalette.border),
              ),
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: const Center(
                child: Text(
                  "Форма ассистента будет подключена позже",
                  style: TextStyle(color: AppPalette.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
