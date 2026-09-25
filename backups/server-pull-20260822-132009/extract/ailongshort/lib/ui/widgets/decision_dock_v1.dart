import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';

class DecisionDockV1 extends StatelessWidget {
  final FuState s;
  const DecisionDockV1({super.key, required this.s});

  @override
  Widget build(BuildContext context) {
    final d = _decision();
    final zoneSummary = _zoneSummary();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withOpacity(0.06),
            Colors.white.withOpacity(0.02),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Î©îÏù∏ Í≤∞Ï†ï ?ºÎ≤®
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: d.color.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: d.color.withOpacity(0.55)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(d.icon, size: 16, color: d.color),
                    const SizedBox(width: 6),
                    Text(
                      d.label,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        color: d.color,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  d.sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.75),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // ?µÏã¨ ?òÏπò 1Ï§?          Row(
            children: [
              _miniChip('Í∑ºÍ±∞', '${s.evidenceHit}/${s.evidenceTotal}'),
              const SizedBox(width: 6),
              _miniChip('?ïÎ•†', '${s.signalProb}%'),
              const SizedBox(width: 6),
              _miniChip('Î¶¨Ïä§??, '${s.risk}'),
              const SizedBox(width: 6),
              Expanded(child: _miniChip('?±Í∏â', s.signalGrade, full: true)),
            ],
          ),
          if (zoneSummary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              zoneSummary,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                height: 1.25,
                color: Colors.white.withOpacity(0.78),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],

          // Îß§Îãà?Ä ?úÏ§Ñ
          if ((s.signalKo).trim().isNotEmpty || (s.decisionTitle).trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Îß§Îãà?Ä: ${(s.signalKo).trim().isNotEmpty ? s.signalKo : s.decisionTitle}'.trim(),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withOpacity(0.72),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _miniChip(String k, String v, {bool full = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        mainAxisSize: full ? MainAxisSize.max : MainAxisSize.min,
        children: [
          Text(
            k,
            style: TextStyle(
              fontSize: 11,
              color: Colors.white.withOpacity(0.55),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              v,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withOpacity(0.88),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  _DecisionView _decision() {
    // Í∏∞Î≥∏: Í¥ÄÎß?    var label = 'Í¥ÄÎß?;
    Color color = Colors.blueGrey;
    var icon = Icons.remove_red_eye_rounded;

    // Í∞ïÏ†ú NO-TRADE ?∞ÏÑ†
    if (s.locked) {
      label = 'Í¥ÄÎß??†Í∏à)';
      color = Colors.deepOrange;
      icon = Icons.block_rounded;
    } else if (s.showSignal && s.signalDir == 'LONG') {
      label = 'Î°??ïÏ†ï';
      color = Colors.lightGreenAccent;
      icon = Icons.trending_up_rounded;
    } else if (s.showSignal && s.signalDir == 'SHORT') {
      label = '???ïÏ†ï';
      color = Colors.redAccent;
      icon = Icons.trending_down_rounded;
    } else {
      // ?ïÏ†ï???ÑÎãà?îÎùº???ïÎ•†???íÏúºÎ©?"Ï£ºÏùò"Î°??úÍ∏∞
      if (s.signalProb >= 65 && s.signalDir != 'NEUTRAL') {
        label = s.signalDir == 'LONG' ? 'Î°?Ï£ºÏùò(Ï°∞Í±¥Î∂Ä)' : '??Ï£ºÏùò(Ï°∞Í±¥Î∂Ä)';
        color = s.signalDir == 'LONG' ? Colors.lightGreenAccent : Colors.orangeAccent;
        icon = Icons.warning_amber_rounded;
      }
    }

    final conf = s.signalProb.clamp(0, 100);
    final ev = s.evidenceHit.clamp(0, s.evidenceTotal);
    final sub = '?ïÏã† ${conf}% ¬∑ Í∑ºÍ±∞ ${ev}/${s.evidenceTotal} ¬∑ ${s.decisionTitle}';

    return _DecisionView(label: label, color: color, icon: icon, sub: sub);
  }

  String _zoneSummary() {
    final parts = <String>[];

    if (s.reactHigh > 0 && s.reactLow > 0) {
      parts.add('Î∞òÏùëÍµ¨Í∞Ñ ${s.reactLow.toStringAsFixed(0)}~${s.reactHigh.toStringAsFixed(0)}');
    }

    // "BPR 2" Í∞ôÏ? ?§Ï§ëÏ°¥Ï? Î¶¨Ïä§?∏Í? 2Í∞??¥ÏÉÅ?¥Î©¥ ?êÎèô?ºÎ°ú ?îÏïΩ
    if (s.bprZones.isNotEmpty) {
      final z = s.bprZones.take(2).toList();
      final label = (z.length >= 2) ? 'BPR1/BPR2' : 'BPR';
      parts.add('$label ${_fmtZone(z.first)}${z.length >= 2 ? ' ¬∑ ${_fmtZone(z[1])}' : ''}');
    }

    if (s.fvgZones.isNotEmpty) {
      parts.add('FVG ${_fmtZone(s.fvgZones.first)}');
    }

    if (s.obZones.isNotEmpty) {
      parts.add('OB ${_fmtZone(s.obZones.first)}');
    }

    // Íµ¨Ï°∞ ?úÍ∑∏
    if (s.structureTag.trim().isNotEmpty) {
      final lv = (s.breakLevel > 0) ? ' ${s.breakLevel.toStringAsFixed(0)}' : '';
      parts.add('${s.structureTag}$lv');
    }

    return parts.join(' ¬∑ ');
  }

  String _fmtZone(FuZone z) {
    return '${z.low.toStringAsFixed(0)}~${z.high.toStringAsFixed(0)}';
  }
}

class _DecisionView {
  final String label;
  final Color color;
  final IconData icon;
  final String sub;
  const _DecisionView({
    required this.label,
    required this.color,
    required this.icon,
    required this.sub,
  });
}
