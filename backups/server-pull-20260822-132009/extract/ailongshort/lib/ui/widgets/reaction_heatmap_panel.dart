import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import 'indicator_info_sheet.dart';

/// v8: Î∞òÏùëÍµ¨Í∞Ñ ?àÌä∏Îß?+ 100% ?úÍ∞Å??(UI ?ÑÏö©)
/// - ?îÏßÑ Í∞?FuState)Îß??¨Ïö©?¥ÏÑú ?åÏÉù
/// - 'Î°????ïÏ†ï/Í¥ÄÎß? ?ÑÎûò?êÏÑú "???ïÏ†ï?∏Ï?"Î•??úÎàà??Î≥¥Ïó¨Ï£ºÎäî ?®ÎÑê
class ReactionHeatmapPanel extends StatelessWidget {
  final FuState s;
  const ReactionHeatmapPanel({super.key, required this.s});

  double _clamp01(num v) => (v.toDouble() / 100.0).clamp(0.0, 1.0);

  String _pct(num v) => '${v.toStringAsFixed(0)}%';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bgGradient = LinearGradient(
      colors: [
        Colors.white.withOpacity(0.06),
        Colors.white.withOpacity(0.03),
      ],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
    final border = Border.all(color: Colors.white.withOpacity(0.10), width: 1);

    // ?µÏã¨ ?êÏàò (0~100)
    final scoreDecision = s.confidenceScore;
    final scoreStructure = s.structureScore;
    final scoreAbsorb = s.absorptionScore;
    final scoreWhale = s.whaleScore;

    // Î∞òÏùëÍµ¨Í∞Ñ
    final zLo = s.reactionZoneLow;
    final zHi = s.reactionZoneHigh;
    final zoneValid = (zLo > 0 && zHi > 0 && zHi >= zLo);

    // '100% Î∞òÏùë'?Ä ?îÏßÑ??100??Ï£ºÏ? ?äÏïÑ?? Ï°∞Í±¥ Í∏∞Î∞ò?ºÎ°ú Î±ÉÏ?Î°úÎßå ?úÏãú
    final evidenceHit = s.evidenceHitCount;
    final isZoneTight = zoneValid && ((zHi - zLo) / (s.price <= 0 ? 1 : s.price)) <= 0.012;
    final isStrong = scoreDecision >= 80 && scoreAbsorb >= 70 && evidenceHit >= 4;
    final is100 = isZoneTight && isStrong;

    Widget meter(String title, num value, {IconData? icon, String? id}) {
      final v01 = _clamp01(value);
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () {
            final key = id ?? IndicatorInfoSheet.aliasToId(title);
            if (key != null) {
              IndicatorInfoSheet.open(context, id: key, value: value, valueText: _pct(value));
            }
          },
          child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.transparent,
            gradient: bgGradient,
            borderRadius: BorderRadius.circular(14),
            border: border,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 14, color: theme.colorScheme.onSurface.withOpacity(0.85)),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.75),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    _pct(value),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurface.withOpacity(0.85),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: v01),
                  duration: const Duration(milliseconds: 280),
                  builder: (context, vv, _) {
                    return LinearProgressIndicator(
                      value: vv,
                      minHeight: 8,
                      backgroundColor: theme.colorScheme.onSurface.withOpacity(0.08),
                    );
                  },
                ),
              ),
            ],
          ),
          ),
        ),
      );
    }

    Widget chip(String text, {Color? bgColor, String? id, num? value}) {
      return InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () {
          final key = id ?? IndicatorInfoSheet.aliasToId(text.split(' ').first);
          if (key != null) {
            IndicatorInfoSheet.open(context, id: key, value: value, valueText: value != null ? _pct(value) : null);
          }
        },
        child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: (bgColor ?? theme.colorScheme.primary).withOpacity(0.16),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.12)),
        ),
          child: Text(
          text,
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: theme.colorScheme.onSurface.withOpacity(0.85),
          ),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.transparent,
        gradient: bgGradient,
        borderRadius: BorderRadius.circular(18),
        border: border,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ???ëÏ? ?îÎ©¥?êÏÑú Row ?§Î≤Ñ?åÎ°ú??Î∞©Ï?: Wrap + ?ïÎ†¨
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                'Î∞òÏùëÍµ¨Í∞Ñ ?àÌä∏Îß?,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (is100) chip('100% Î∞òÏùë', bgColor: theme.colorScheme.tertiary, id: 'reaction', value: 100),
              chip('Í∑ºÍ±∞ ${evidenceHit}/${s.evidenceNeed}', id: 'confirm'),
            ],
          ),
          const SizedBox(height: 10),
          if (zoneValid)
            // ???ëÏ? ?îÎ©¥?êÏÑú Row ?§Î≤Ñ?åÎ°ú??Î∞©Ï?: Wrap
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                chip('Íµ¨Í∞Ñ ${zLo.toStringAsFixed(0)} ~ ${zHi.toStringAsFixed(0)}', bgColor: theme.colorScheme.secondary, id: 'reaction'),
                chip('?ÑÏû¨ ${s.price.toStringAsFixed(0)}', id: 'reaction'),
                chip('?ïÏ†ï ${_pct(s.signalProb)}', id: 'confirm', value: s.signalProb),
              ],
            )
          else
            Text(
              'Î∞òÏùëÍµ¨Í∞Ñ ?∞Ïù¥???ÜÏùå (?îÏßÑ ?ÖÎç∞?¥Ìä∏ ?ÄÍ∏?',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.65),
                fontWeight: FontWeight.w700,
              ),
            ),
          const SizedBox(height: 10),
          // ??4Í∞?ÎØ∏ÌÑ∞???îÎ©¥ ??óê ?∞Îùº ?êÎèô Ï§ÑÎ∞îÍø?          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              meter('Í≤∞Ï†ï??, scoreDecision, icon: Icons.flash_on_rounded, id: 'decision_power'),
              meter('Íµ¨Ï°∞', scoreStructure, icon: Icons.account_tree_rounded, id: 'ob_choch'),
              meter('?†Îèô??, scoreAbsorb, icon: Icons.water_drop_rounded, id: 'liquidity'),
              meter('Í≥†Îûò', scoreWhale, icon: Icons.waves_rounded, id: 'whale_score'),
            ],
          ),
          const SizedBox(height: 10),
          _MiniHeatmapRow(
            title: '?µÏã¨ Í∑ºÍ±∞',
            items: [
              _HeatItem('BPR2+Í∏àÎî±', s.bprConfluenceScore),
              _HeatItem('PO3', s.po3Score),
              _HeatItem('OB/CHOCH', s.obChochScore),
              _HeatItem('FVG/BPR', s.fvgBprScore),
              _HeatItem('?§Ïúï?ÑÌóò??, (100 - s.sweepRisk).clamp(0, 100)),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeatItem {
  final String label;
  final num value; // 0~100
  const _HeatItem(this.label, this.value);
}

class _MiniHeatmapRow extends StatelessWidget {
  final String title;
  final List<_HeatItem> items;
  const _MiniHeatmapRow({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final border = Border.all(color: Colors.white.withOpacity(0.10), width: 1);
    final on = theme.colorScheme.onSurface;

    Color cellColor(num v) {
      final t = (v.toDouble() / 100.0).clamp(0.0, 1.0);
      // ??ÏßÄ???ÜÏù¥ onSurface opacityÎ°úÎßå Í∞ïÎèÑ ?úÌòÑ (?îÏ≤≠: ??Í≥†Ï†ï ?åÌîº)
      return on.withOpacity(0.06 + 0.18 * t);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.labelSmall?.copyWith(
            color: on.withOpacity(0.75),
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: items.map((it) {
            final id = IndicatorInfoSheet.aliasToId(it.label);
            return InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: id == null
                  ? null
                  : () => IndicatorInfoSheet.open(context, id: id, value: it.value, valueText: '${it.value.toStringAsFixed(0)}%'),
              child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: cellColor(it.value),
                borderRadius: BorderRadius.circular(14),
                border: border,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    it.label,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: on.withOpacity(0.85),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${it.value.toStringAsFixed(0)}%',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: on.withOpacity(0.85),
                    ),
                  ),
                ],
              ),
            ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
