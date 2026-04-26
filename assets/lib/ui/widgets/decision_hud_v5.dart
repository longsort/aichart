import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';

/// v5: 미니차트 아래 "결정 HUD" (매수 확정 / 매도 확정 / 관망)
/// + 반응구간 통계(최근 터치 성공률) + 왜 확정/관망 한줄
/// - 기존 엔진(FuState) 값만 사용
/// - 사용자가 1초 만에 결론을 보게 만드는 단일 카드
class DecisionHudV5 extends StatelessWidget {
  final FuState s;
  const DecisionHudV5({super.key, required this.s});

  String _titleKo() {
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) {
      // 기존 decisionTitle이 들어오면 그대로 쓰되, "롱/숏"은 "매수/매도"로 치환
      return t.replaceAll('롱', '매수').replaceAll('숏', '매도');
    }
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return '매수 확정';
    if (dir == 'SHORT') return '매도 확정';
    return '관망';
  }

  Color _accent() {
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return const Color(0xFF4DA3FF); // BLUE
    if (dir == 'SHORT') return const Color(0xFFFF4D7D); // RED
    return const Color(0xFFB7BDC6); // GREY
  }

  String _pctStr() => '${s.signalProb.clamp(0, 100)}%';

  List<_EvRow> _evRows() {
    final bullets = s.signalBullets;
    final base = s.signalProb.clamp(0, 100).toDouble();
    final rows = <_EvRow>[];

    for (var i = 0; i < math.min(4, bullets.length); i++) {
      final w = switch (i) { 0 => 1.0, 1 => 0.78, 2 => 0.60, _ => 0.45 };
      rows.add(_EvRow(text: bullets[i], value: (base * w).clamp(0, 100)));
    }

    if (rows.isEmpty) {
      rows.add(_EvRow(text: '근거가 부족합니다 (관망)', value: base * 0.40));
      rows.add(_EvRow(text: '다중TF 합의 확인', value: base * 0.35));
      rows.add(_EvRow(text: '유동성/스윕 리스크 체크', value: base * 0.30));
    }

    return rows;
  }

  List<String> _targets() {
    if (s.zoneTargets.isNotEmpty) {
      return s.zoneTargets.take(3).map((e) => e.toStringAsFixed(0)).toList();
    }
    if (s.target > 0) return [s.target.toStringAsFixed(0)];
    return const ['-'];
  }

  _ReactStat _calcReactStat() {
    final candles = s.candles;
    final lo = s.reactLow;
    final hi = s.reactHigh;
    if (candles.isEmpty || lo <= 0 || hi <= 0 || hi <= lo) {
      return _ReactStat(pct: s.signalProb.round().clamp(0, 100).toInt(), touches: 0, avgMovePct: 0.0);
    }

    final int lookback = math.min(140, candles.length);
    const int horizon = 3; // 터치 후 1~3캔들 내 반응 체크
    final dir = s.signalDir.toUpperCase();

    final lastClose = candles.last.close;
    final band = (hi - lo).abs();
    final minMove = math.max(band * 0.80, lastClose * 0.002); // 구간폭 기반 또는 0.2%

    int touches = 0;
    int success = 0;
    double moveSumPct = 0;

    final start = candles.length - lookback;
    for (int i = start; i < candles.length - horizon; i++) {
      final c = candles[i];
      final touched = (c.low <= hi) && (c.high >= lo);
      if (!touched) continue;

      touches += 1;

      double bestMove = 0;
      if (dir == 'SHORT') {
        var minLow = candles[i + 1].low;
        for (int k = 1; k <= horizon; k++) {
          minLow = math.min(minLow, candles[i + k].low);
        }
        bestMove = c.close - minLow;
      } else {
        var maxHigh = candles[i + 1].high;
        for (int k = 1; k <= horizon; k++) {
          maxHigh = math.max(maxHigh, candles[i + k].high);
        }
        bestMove = maxHigh - c.close;
      }

      final ok = bestMove >= minMove;
      if (ok) {
        success += 1;
        moveSumPct += (bestMove / math.max(1e-9, c.close)) * 100.0;
      }
    }

    if (touches == 0) {
      return _ReactStat(pct: s.signalProb.round().clamp(0, 100).toInt(), touches: 0, avgMovePct: 0.0);
    }

    final pct = ((success / touches) * 100).round().clamp(0, 100).toInt();
    final avg = (success == 0) ? 0.0 : (moveSumPct / success).toDouble();
    return _ReactStat(pct: pct, touches: touches, avgMovePct: avg);
  }

  String _whyLine(_ReactStat rs) {
    final risk = s.sweepRisk.clamp(0, 100);
    if (s.locked) {
      return '관망(LOCK): ${s.lockedReason.isNotEmpty ? s.lockedReason : '조건 미충족'}';
    }
    if (!s.consensusOk) {
      return '관망: 다중TF 합의 부족 · 반응 ${rs.pct}%';
    }
    if (risk >= 65) {
      return '주의: 스윕/스탑헌트 리스크 ${risk}%';
    }
    if (s.signalDir.toUpperCase() == 'NEUTRAL' || s.signalProb < 60) {
      return '관망: 확정도 부족(${s.signalProb}%) · 근거 ${s.evidenceHit}/${s.evidenceTotal}';
    }
    return '확정 근접: 반응 ${rs.pct}% · 근거 ${s.evidenceHit}/${s.evidenceTotal} · 리스크 ${risk}%';
  }

  @override
  Widget build(BuildContext context) {
    final accent = _accent();
    final bg = Theme.of(context).colorScheme.surface;
    final title = _titleKo();

    final g1 = s.confidenceScore.clamp(0, 100);
    final g2 = (s.evidenceTotal <= 0) ? 0 : ((s.evidenceHit / s.evidenceTotal) * 100).round().clamp(0, 100);
    final g3 = s.absorptionScore.clamp(0, 100);
    final g4 = s.forceScore.clamp(0, 100);

    final entry = (s.entry > 0) ? s.entry.toStringAsFixed(0) : '-';
    final stop = (s.stop > 0) ? s.stop.toStringAsFixed(0) : '-';
    final tps = _targets();

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.80),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withOpacity(0.55), width: 1.2),
        boxShadow: [
          BoxShadow(color: accent.withOpacity(0.14), blurRadius: 18, spreadRadius: 1, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: accent.withOpacity(0.55), width: 1),
                ),
                child: Text(
                  '[${title}]',
                  style: TextStyle(color: accent, fontWeight: FontWeight.w900, letterSpacing: 0.2),
                ),
              ),
              const Spacer(),
              Text('확정도', style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 12)),
              const SizedBox(width: 6),
              Text(_pctStr(), style: TextStyle(color: accent, fontSize: 14, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),

          // 큰 퍼센트
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent.withOpacity(0.20), Colors.transparent],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              children: [
                Text(
                  _pctStr().replaceAll('%', ''),
                  style: TextStyle(
                    color: accent,
                    fontSize: 52,
                    fontWeight: FontWeight.w900,
                    height: 1.0,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  s.signalKo.isNotEmpty ? s.signalKo : '결정 요약',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 12),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          const _SectionTitle(icon: Icons.check_circle, text: '근거'),
          const SizedBox(height: 6),
          ..._evRows().map((e) => _EvidenceBar(text: e.text, value: e.value, accent: accent)),

          const SizedBox(height: 12),

          // v5: 반응구간 통계 (최근 터치 성공률)
          Builder(
            builder: (context) {
              final rs = _calcReactStat();
              final sub = (rs.touches <= 0)
                  ? '최근 터치 데이터 없음'
                  : '최근 ${rs.touches}회 터치 · 평균 반응 ${rs.avgMovePct.toStringAsFixed(2)}%';
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _SectionTitle(icon: Icons.bolt, text: '반응구간'),
                  const SizedBox(height: 6),
                  _EvidenceBar(text: '반응 성공률', value: rs.pct.toDouble(), accent: accent),
                  const SizedBox(height: 4),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _whyLine(rs),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ],
              );
            },
          ),

          const SizedBox(height: 10),

          const _SectionTitle(icon: Icons.flag, text: '추천'),
          const SizedBox(height: 6),
          _RecGrid(accent: accent, entry: entry, stop: stop, tps: tps),

          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(child: _MiniGauge(label: '정도', value: g1, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '구조', value: g2, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '유동성', value: g3, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '파동', value: g4, accent: accent)),
            ],
          ),

          if (s.signalWhy.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              '매니저: ${s.signalWhy}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white.withOpacity(0.68), fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReactStat {
  final int pct;
  final int touches;
  final double avgMovePct;
  const _ReactStat({required this.pct, required this.touches, required this.avgMovePct});
}

class _EvRow {
  final String text;
  final double value;
  _EvRow({required this.text, required this.value});
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String text;
  const _SectionTitle({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: Colors.white.withOpacity(0.75)),
        const SizedBox(width: 6),
        Text(text, style: TextStyle(color: Colors.white.withOpacity(0.82), fontSize: 12, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _EvidenceBar extends StatelessWidget {
  final String text;
  final double value;
  final Color accent;
  const _EvidenceBar({required this.text, required this.value, required this.accent});

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(Icons.check, size: 14, color: accent.withOpacity(0.9)),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12)),
                const SizedBox(height: 3),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: v / 100.0,
                    minHeight: 6,
                    backgroundColor: Colors.white.withOpacity(0.08),
                    valueColor: AlwaysStoppedAnimation<Color>(accent.withOpacity(0.85)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 40, child: Text('${v.toStringAsFixed(0)}%', textAlign: TextAlign.right, style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12))),
        ],
      ),
    );
  }
}

class _RecGrid extends StatelessWidget {
  final Color accent;
  final String entry;
  final String stop;
  final List<String> tps;
  const _RecGrid({required this.accent, required this.entry, required this.stop, required this.tps});

  @override
  Widget build(BuildContext context) {
    String tp(int i) => (i < tps.length) ? tps[i] : '-';

    Widget chip(String label, String value) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(color: accent.withOpacity(0.95), fontWeight: FontWeight.w900, fontSize: 12)),
          ],
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: chip('진입', entry)),
            const SizedBox(width: 8),
            Expanded(child: chip('손절', stop)),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: chip('목표1', tp(0))),
            const SizedBox(width: 8),
            Expanded(child: chip('목표2', tp(1))),
            const SizedBox(width: 8),
            Expanded(child: chip('목표3', tp(2))),
          ],
        ),
      ],
    );
  }
}

class _MiniGauge extends StatelessWidget {
  final String label;
  final int value;
  final Color accent;
  const _MiniGauge({required this.label, required this.value, required this.accent});

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.035),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.07)),
      ),
      child: Column(
        children: [
          Text('$v%', style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 2),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11)),
        ],
      ),
    );
  }
}
