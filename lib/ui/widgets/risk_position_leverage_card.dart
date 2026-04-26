import 'dart:ui';
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/app_settings.dart';
import '../../engine/risk/risk_sizing.dart';

/// 5% Î¶¨Ïä§??Í¥ÄÎ¶?¬∑ ÏßÑÏûÖ ?¨Ï???Í∑úÎ™® ¬∑ ?êÏ†à ¬∑ ?àÎ≤ÑÎ¶¨Ï? (?§ÏãúÍ∞?
/// ÎØ∏ÎûòÏ∞®Ìä∏/Î©îÏù∏ Í≥µÏö© ???îÏßÑ ?∞Ïù¥??Í∏∞Ï? ?§ÏãúÍ∞?Í≥ÑÏÇ∞
class RiskPositionLeverageCard extends StatelessWidget {
  final FuState s;
  final double? entryOverride;
  final double? slOverride;
  final double? tpOverride;
  final double livePrice;

  const RiskPositionLeverageCard({
    super.key,
    required this.s,
    required this.livePrice,
    this.entryOverride,
    this.slOverride,
    this.tpOverride,
  });

  @override
  Widget build(BuildContext context) {
    final price = s.candles.isNotEmpty ? s.candles.last.close : livePrice;
    final entry = (entryOverride ?? (s.entry > 0 ? s.entry : price));
    final sl = (slOverride ?? (s.stop > 0 ? s.stop : entry * 0.99));
    final tp = (tpOverride ?? (s.target > 0 ? s.target : entry * 1.01));
    final balance = AppSettings.accountUsdt;
    final riskPct = AppSettings.riskPct / 100.0;

    final sizing = RiskSizing.size(
      balance: balance,
      entry: entry,
      sl: sl,
      riskPct: riskPct,
    );
    final riskAmount = (sizing['riskAmount'] ?? 0.0) as double;
    final qty = (sizing['qty'] ?? 0.0) as double;
    final lev = (sizing['leverage'] ?? 1) as int;
    final effLeverage = (s.leverage > 0 ? s.leverage.round() : lev).clamp(1, 100);

    final risk = (entry - sl).abs();
    final reward = (tp - entry).abs();
    final rr = risk > 0 ? (reward / risk) : 0.0;

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xFF1A1F35).withOpacity(0.92),
                const Color(0xFF0D1220).withOpacity(0.95),
              ],
            ),
            border: Border.all(
              width: 1.5,
              color: Colors.white.withOpacity(0.12),
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF39FFB6).withOpacity(0.08),
                blurRadius: 20,
                spreadRadius: 0,
              ),
              BoxShadow(
                color: Colors.black.withOpacity(0.4),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFF39FFB6).withOpacity(0.25),
                          const Color(0xFF00D4AA).withOpacity(0.15),
                        ],
                      ),
                      border: Border.all(color: const Color(0xFF39FFB6).withOpacity(0.5)),
                    ),
                    child: Text(
                      'Î¶¨Ïä§??${(riskPct * 100).toStringAsFixed(0)}% ¬∑ ?¨Ï???¬∑ ?àÎ≤ÑÎ¶¨Ï?',
                      style: const TextStyle(
                        color: Color(0xFFB8FFE8),
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _tile('Î¶¨Ïä§?¨Í∏à??, '${riskAmount.toStringAsFixed(1)} U', const Color(0xFF39FFB6)),
                  const SizedBox(width: 10),
                  _tile('?òÎüâ', qty >= 0.01 ? qty.toStringAsFixed(4) : qty.toStringAsFixed(6), Colors.white),
                  const SizedBox(width: 10),
                  _tile('?àÎ≤Ñ', '${effLeverage}x', const Color(0xFFFFD166)),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _tile('?Ä??, entry.toStringAsFixed(0), Colors.white70),
                  const SizedBox(width: 8),
                  _tile('?êÏ†à', sl.toStringAsFixed(0), const Color(0xFFFF4D6D)),
                  const SizedBox(width: 8),
                  _tile('Î™©Ìëú', tp.toStringAsFixed(0), const Color(0xFF39FFB6)),
                  const SizedBox(width: 8),
                  _tile('RR', rr.toStringAsFixed(2), const Color(0xFFFFD166)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(String label, String value, Color valueColor) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: Colors.white.withOpacity(0.04),
          border: Border.all(color: Colors.white.withOpacity(0.06)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withOpacity(0.6),
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                color: valueColor,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
