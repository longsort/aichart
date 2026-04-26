import 'package:shared_preferences/shared_preferences.dart';
import '../risk_engine/engine.dart';
import '../config/profit_mode.dart';
import '../../engine/paper/paper_trade_engine.dart';

enum RiskPreset { conservative, standard, aggressive }

class RiskPresetManager {
  static const _k = 'risk_preset';

  static Future<RiskPreset> load() async {
    final sp = await SharedPreferences.getInstance();
    final v = sp.getString(_k) ?? 'standard';
    return RiskPreset.values.firstWhere((e) => e.name == v, orElse: () => RiskPreset.standard);
  }

  static Future<void> set(RiskPreset p) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_k, p.name);
    apply(p);
  }

  static void apply(RiskPreset p) {
    // RiskConfig (5% Î£?Í∏∞Î∞ò, ?ÑÎ¶¨?ãÏúºÎ°?Î≤†Ïù¥???àÎ≤Ñ Ï∫?Ï°∞Ï†à)
    switch (p) {
      case RiskPreset.conservative:
        RiskConfig.baseRisk = 0.03;
        RiskConfig.counterRisk = 0.02;
        RiskConfig.maxLeverage = 15.0;
        ProfitConfig.minRR = 1.8;
        ProfitConfig.lowSize = 0.20;
        ProfitConfig.highSize = 0.80;
        ProfitConfig.maxLev = 15;
        PaperTradeEngine.I.autoEntryThreshold.value = 0.90;
        break;
      case RiskPreset.standard:
        RiskConfig.baseRisk = 0.05;
        RiskConfig.counterRisk = 0.03;
        RiskConfig.maxLeverage = 25.0;
        ProfitConfig.minRR = 1.5;
        ProfitConfig.lowSize = 0.30;
        ProfitConfig.highSize = 1.00;
        ProfitConfig.maxLev = 20;
        PaperTradeEngine.I.autoEntryThreshold.value = 0.85;
        break;
      case RiskPreset.aggressive:
        RiskConfig.baseRisk = 0.07;
        RiskConfig.counterRisk = 0.04;
        RiskConfig.maxLeverage = 50.0;
        ProfitConfig.minRR = 1.3;
        ProfitConfig.lowSize = 0.40;
        ProfitConfig.highSize = 1.00;
        ProfitConfig.maxLev = 30;
        PaperTradeEngine.I.autoEntryThreshold.value = 0.80;
        break;
    }
  }
}
