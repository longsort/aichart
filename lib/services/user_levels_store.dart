
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class UserLevelsStore {
  static final UserLevelsStore I = UserLevelsStore._();
  UserLevelsStore._();

  static const _k = 'user_levels_5';

  final ValueNotifier<List<double?>> levels = ValueNotifier<List<double?>>(
    List<double?>.filled(5, null),
  );

  Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getStringList(_k);
    if (raw == null || raw.length != 5) return;
    final v = <double?>[];
    for (final s in raw) {
      if (s.trim().isEmpty) v.add(null);
      else v.add(double.tryParse(s));
    }
    levels.value = v;
  }

  Future<void> save(List<double?> v) async {
    levels.value = v;
    final sp = await SharedPreferences.getInstance();
    final raw = v.map((x) => x == null ? '' : x.toString()).toList(growable: false);
    await sp.setStringList(_k, raw);
  }
}
