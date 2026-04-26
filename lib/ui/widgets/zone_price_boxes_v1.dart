import 'package:flutter/material.dart';
import '../../models/zone.dart';

/// 가격�? ?�모 박스(지지/?�??박스) 빠른 ?�약
/// - 기존 ?�진(ZoneCandidateEngine/ZoneStrengthEngine) 결과�?'?????�로 보여�?
/// - 기능 ??�� ?�이, ?�크롤을 줄이�??�한 ?�단 ?�약???�젯.
class ZonePriceBoxesV1 extends StatelessWidget {
  final List<ZoneCandidate> zones;
  final double lastPrice;

  const ZonePriceBoxesV1({
    super.key,
    required this.zones,
    required this.lastPrice,
  });

  String _label(ZoneType t) {
    switch (t) {
      case ZoneType.support:
        return '지지';
      case ZoneType.resistance:
        return '?�??;
      case ZoneType.box:
        return '박스';
    }
  }

  String _strength(int s) {
    if (s >= 80) return '강함';
    if (s >= 60) return '중간';
    return '?�함';
  }

  Color _color(ZoneType t) {
    switch (t) {
      case ZoneType.support:
        return Colors.greenAccent;
      case ZoneType.resistance:
        return Colors.redAccent;
      case ZoneType.box:
        return Colors.white70;
    }
  }

  String _money(double v) {
    // 간단 ?�기
    if (v >= 1000) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  @override
  Widget build(BuildContext context) {
    if (zones.isEmpty) return const SizedBox.shrink();

    return Card(
      elevation: 0,
      color: Colors.black.withOpacity(0.25),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('?�심 가격�?(?�약)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: zones.map((z) => _box(z)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _box(ZoneCandidate z) {
    final c = _color(z.type);
    final s = z.score.clamp(0, 100);
    final mid = (z.low + z.high) / 2.0;
    final distPct = ((lastPrice - mid).abs() / (lastPrice == 0 ? 1 : lastPrice) * 100);
    final distTxt = distPct.isFinite ? '${distPct.toStringAsFixed(2)}%' : '??;

    return Container(
      width: 210,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.withOpacity(0.55), width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(_label(z.type),
                  style: TextStyle(
                      color: c, fontWeight: FontWeight.w900, fontSize: 12)),
              const Spacer(),
              Text('${_strength(s)} ${s}%',
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.85),
                      fontWeight: FontWeight.w800,
                      fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          Text('${_money(z.low)} ~ ${_money(z.high)}',
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: LinearProgressIndicator(
                    value: (s / 100).clamp(0, 1),
                    minHeight: 8,
                    backgroundColor: Colors.white12,
                    valueColor: AlwaysStoppedAnimation<Color>(c),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text('거리 $distTxt',
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 6),
          Text(z.reason,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11)),
        ],
      ),
    );
  }
}
