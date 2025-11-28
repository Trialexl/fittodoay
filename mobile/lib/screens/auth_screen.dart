import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_state.dart';
import '../theme.dart';
import '../widgets/primary_button.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _isLogin = true;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final authNotifier = ref.read(authProvider.notifier);

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.user != null) {
        context.go('/programs');
      }
    });

    return Scaffold(
      backgroundColor: AppPalette.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'fitTODOay',
                style: TextStyle(color: AppPalette.textPrimary, fontSize: 28, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                _isLogin ? 'Вход в аккаунт' : 'Регистрация',
                style: const TextStyle(color: AppPalette.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              _InputField(controller: _emailCtrl, label: 'E-mail', keyboardType: TextInputType.emailAddress),
              const SizedBox(height: AppSpacing.md),
              _InputField(controller: _passwordCtrl, label: 'Пароль', obscure: true),
              const SizedBox(height: AppSpacing.md),
              if (authState.error != null)
                Text(authState.error!, style: const TextStyle(color: Colors.redAccent)),
              const SizedBox(height: AppSpacing.md),
              PrimaryButton(
                label: _isLogin ? 'Войти' : 'Зарегистрироваться',
                isLoading: authState.isLoading,
                onPressed: () {
                  if (_isLogin) {
                    authNotifier.login(_emailCtrl.text.trim(), _passwordCtrl.text);
                  } else {
                    authNotifier.register(_emailCtrl.text.trim(), _passwordCtrl.text);
                  }
                },
              ),
              TextButton(
                onPressed: () => setState(() => _isLogin = !_isLogin),
                child: Text(
                  _isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти',
                  style: const TextStyle(color: AppPalette.accent),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InputField extends StatelessWidget {
  const _InputField({
    required this.controller,
    required this.label,
    this.obscure = false,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final bool obscure;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppPalette.muted)),
        const SizedBox(height: AppSpacing.xs),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscure,
          decoration: InputDecoration(
            filled: true,
            fillColor: AppPalette.surface,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.md),
              borderSide: const BorderSide(color: AppPalette.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.md),
              borderSide: const BorderSide(color: AppPalette.accent),
            ),
          ),
          style: const TextStyle(color: AppPalette.textPrimary),
        ),
      ],
    );
  }
}
