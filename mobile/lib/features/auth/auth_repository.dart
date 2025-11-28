import 'package:dio/dio.dart';

import '../../config.dart';
import '../../data/api_client.dart';
import '../../data/secure_storage.dart';

class AuthRepository {
  final Dio _dio = ApiClient.client;

  Future<AuthPayload> login({required String email, required String password}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login/',
      data: {'email': email, 'password': password},
    );
    final data = response.data ?? {};
    final payload = AuthPayload.fromJson(data);
    await SecureStorage.saveToken(payload.token);
    return payload;
  }

  Future<AuthPayload> register({
    required String email,
    required String password,
    String? firstName,
    String? lastName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/register/',
      data: {
        'email': email,
        'password': password,
        if (firstName != null) 'first_name': firstName,
        if (lastName != null) 'last_name': lastName,
        'profile': {
          'goal': 'strength',
          'gender': 'male',
          'age': 25,
          'weight_kg': 70,
          'height_cm': 175,
          'level': 'beginner',
          'equipment': 'gym',
          'health_limitations': '',
          'preferred_schedule_notes': '',
        },
      },
    );
    final data = response.data ?? {};
    final payload = AuthPayload.fromJson(data);
    await SecureStorage.saveToken(payload.token);
    return payload;
  }

  Future<void> logout() async {
    await SecureStorage.clearToken();
  }
}

class AuthPayload {
  AuthPayload({required this.token, required this.user});

  final String token;
  final UserDto user;

  factory AuthPayload.fromJson(Map<String, dynamic> json) {
    return AuthPayload(
      token: json['token'] as String,
      user: UserDto.fromJson(json['user'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class UserDto {
  UserDto({
    required this.id,
    required this.email,
    this.firstName,
    this.lastName,
  });

  final int id;
  final String email;
  final String? firstName;
  final String? lastName;

  factory UserDto.fromJson(Map<String, dynamic> json) {
    return UserDto(
      id: json['id'] as int? ?? 0,
      email: json['email'] as String? ?? '',
      firstName: json['first_name'] as String?,
      lastName: json['last_name'] as String?,
    );
  }
}
