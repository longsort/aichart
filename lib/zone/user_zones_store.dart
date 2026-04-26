
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class UserZonesStore {
  static const _k = 'user_zones_v1';
  static final ValueNotifier<List<double>> zones = ValueNotifier([0,0,0,0,0]);

  static Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString(_k);
    if(raw==null) return;
    final j = jsonDecode(raw);
    zones.value = (j as List).map((e)=> (e as num).toDouble()).toList(growable:false);
  }

  static Future<void> save(List<double> v) async {
    zones.value = List<double>.from(v);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_k, jsonEncode(v));
  }
}
