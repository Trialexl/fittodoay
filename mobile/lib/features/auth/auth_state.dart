import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_repository.dart';

class AuthState {
  const AuthState._({this.isLoading = false, this.error, this.user});

  final bool isLoading;
  final String? error;
  final UserDto? user;

  const AuthState.initial() : this._();
  const AuthState.loading() : this._(isLoading: true);
  const AuthState.failure(String message) : this._(error: message);
  const AuthState.success(UserDto user) : this._(user: user);
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repo) : super(const AuthState.initial());

  final AuthRepository _repo;

  Future<void> login(String email, String password) async {
    state = const AuthState.loading();
    try {
      final payload = await _repo.login(email: email, password: password);
      state = AuthState.success(payload.user);
    } catch (e) {
      state = AuthState.failure(_friendlyError(e));
    }
  }

  Future<void> register(String email, String password) async {
    state = const AuthState.loading();
    try {
      final payload = await _repo.register(email: email, password: password);
      state = AuthState.success(payload.user);
    } catch (e) {
      state = AuthState.failure(_friendlyError(e));
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState.initial();
  }

  String _friendlyError(Object e) {
    if (e is Exception) return e.toString();
    return 'Ошибка запроса';
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository());
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(authRepositoryProvider)),
);
