import 'package:shared_preferences/shared_preferences.dart';

class StatePersist {
  static const _kSymbol = 'last_symbol';
  static const _kTf = 'last_tf';

  static Future<void> save({required String symbol, required String tf}) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kSymbol, symbol);
    await sp.setString(_kTf, tf);
  }

  static Future<(String, String)> load({String defSymbol = 'BTCUSDT', String defTf = '15m'}) async {
    final sp = await SharedPreferences.getInstance();
    final s = sp.getString(_kSymbol) ?? defSymbol;
    final tf = sp.getString(_kTf) ?? defTf;
    return (s, tf);
  }
}
