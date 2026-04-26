
import 'package:flutter/material.dart';

import '../../core_ai/super_agi_v7.dart';
import 'neon_theme.dart';

/// 미니차트 아래 고정: SUPER AGI 매니저 스트립 (2줄 브리핑 + 핵심 수치)
class SuperAgiManagerStripV1 extends StatelessWidget {
  final SuperAgiV7Out out;
  final NeonTheme theme;
  const SuperAgiManagerStripV1({super.key, required this.out, required this.theme});

  Color _evColor() => out.evR >= 0 ? theme.good : theme.bad;
  Color _riskColor() => out.stopHuntRisk >= 70 ? theme.bad : (out.stopHuntRisk >= 50 ? theme.warn : theme.good);
  Color _stateColor() {
    switch (out.state) {
      case 'LOCK':
        return theme.bad;
      case 'CONFIRM':
        return theme.good;
      case 'TEST':
        return theme.warn;
      case 'FAIL':
        return theme.bad;
      default:
        return theme.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0B1020),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.stroke, width: 1),
        boxShadow: [
          BoxShadow(
            color: theme.glow.withOpacity(0.15),
            blurRadius: 12,
            spreadRadius: 0,
            offset: const Offset(0, 6),
          )
        ],
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // line 1
          Row(
            children: [
              _pill(out.state, _stateColor()),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  out.managerLine1,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: theme.textPrimary, fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // line 2
          Row(
            children: [
              _miniKV('EV', '${out.evR >= 0 ? '+' : ''}${out.evR.toStringAsFixed(2)}R', _evColor()),
              const SizedBox(width: 8),
              _miniKV('헌팅', '${out.stopHuntRisk}', _riskColor()),
              const SizedBox(width: 8),
              _miniKV('SL', out.slRecommended.toStringAsFixed(0), theme.textSecondary),
              const SizedBox(width: 8),
              _miniKV('LEV', '${out.leverage.toStringAsFixed(1)}x', theme.textSecondary),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            out.managerLine2,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: theme.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _pill(String text, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.45), width: 1),
      ),
      child: Text(text, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }

  Widget _miniKV(String k, String v, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xFF101A33),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.stroke.withOpacity(0.8), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(k, style: TextStyle(color: theme.textSecondary, fontSize: 10)),
          const SizedBox(width: 6),
          Text(v, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
