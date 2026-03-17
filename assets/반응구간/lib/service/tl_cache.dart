import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/analysis/adaptive_lux_trendline.dart';

class TlCache {
  static String _k(String symbol, String tfKey) => 'tl_cache_${symbol}_$tfKey';

  static Future<void> save(String symbol, String tfKey, LuxTlResult r) async {
    try {
      final sp = await SharedPreferences.getInstance();
      final j = r.toJson();
      j['ts_saved'] = DateTime.now().millisecondsSinceEpoch;
      await sp.setString(_k(symbol, tfKey), jsonEncode(j));
    } catch (_) {}
  }

  static Future<LuxTlResult?> load(String symbol, String tfKey) async {
    try {
      final sp = await SharedPreferences.getInstance();
      final s = sp.getString(_k(symbol, tfKey));
      if (s == null || s.isEmpty) return null;
      final j = jsonDecode(s) as Map<String, dynamic>;
      return LuxTlResult.fromJson(j);
    } catch (_) {
      return null;
    }
  }
}