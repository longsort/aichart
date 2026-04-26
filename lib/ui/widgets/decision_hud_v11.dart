import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import 'indicator_info_sheet.dart';
import 'reaction_heatmap_panel.dart';

/// v11: v7 + "?�시�?체결/?�력 ?�착" ?�자/�??�각??추�?
/// - FuState 기존 ?�드�??�용 (compile-safe)
/// - PO3???�리?�틱(?�윕/?�수/?�스/구조?�그)�??�출
class DecisionHudV11 extends StatelessWidget {
  final FuState s;
  const DecisionHudV11({super.key, required this.s});

  /// PATCH-3 FIX: flowHint getter (compile-safe)
  /// - Prefer engine-provided s.flowHint when available
  /// - Fallback to quick heuristic from existing percentages
  String get flowHint {
    final v = s.flowHint.trim();
    if (v.isNotEmpty) return v;
    final tape = s.tapeBuyPct.clamp(0, 100).toDouble();
    final ob = s.obImbalance.clamp(0, 100).toDouble();
    final whale = s.whaleBuyPct.clamp(0, 100).toDouble();
    final inst = s.instBias.clamp(0, 100).toDouble();
    final abs = s.absorptionScore.clamp(0, 100).toDouble();
    final sweep = s.sweepRisk.clamp(0, 100).toDouble();

    final buyBias = (tape * 0.35) + (ob * 0.25) + (whale * 0.20) + (inst * 0.20);
    final sellBias = ((100.0 - tape) * 0.35) + ((100.0 - ob) * 0.25) + ((100.0 - whale) * 0.20) + ((100.0 - inst) * 0.20);

    final riskTag = (sweep >= 70.0) ? ' ?�️?�윕' : '';
    final absTag = (abs >= 70.0) ? ' ?�수' : (abs <= 30.0 ? ' ?�함' : '');
    if (buyBias - sellBias >= 12.0) return '매수 ?�세${absTag}${riskTag}'.trim();
    if (sellBias - buyBias >= 12.0) return '매도 ?�세${absTag}${riskTag}'.trim();
    return '중립${riskTag}'.trim();
  }

  String _titleKo() {
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) {
      return t.replaceAll('�?, '매수').replaceAll('??, '매도');
    }
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return '매수 ?�정';
    if (dir == 'SHORT') return '매도 ?�정';
    return '관�?;
  }

  Color _accent() {
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return const Color(0xFF4DA3FF);
    if (dir == 'SHORT') return const Color(0xFFFF4D7D);
    return const Color(0xFFB7BDC6);
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
      rows.add(_EvRow(text: '근거가 부족합?�다 (관�?', value: base * 0.40));
      rows.add(_EvRow(text: '?�중TF ?�의 ?�인', value: base * 0.35));
      rows.add(_EvRow(text: '?�동???�윕 리스??체크', value: base * 0.30));
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
    const int horizon = 3;
    final dir = s.signalDir.toUpperCase();

    final lastClose = candles.last.close;
    final band = (hi - lo).abs();
    final minMove = math.max(band * 0.80, lastClose * 0.002);

    int touches = 0;
    int success = 0;
    double moveSumPct = 0.0;

    final start = candles.length - lookback;
    for (int i = start; i < candles.length - horizon; i++) {
      final c = candles[i];
      final touched = (c.low <= hi) && (c.high >= lo);
      if (!touched) continue;

      touches += 1;

      double bestMove = 0.0;
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

  /// PO3 ?�리?�틱: 축적(A) / 조작(M) / 분배(D)
  _Po3Chip _po3() {
    final st = s.structureTag.toUpperCase();
    final risk = s.sweepRisk.clamp(0, 100);
    final abs = s.absorptionScore.clamp(0, 100);
    final force = s.forceScore.clamp(0, 100);
    final prob = s.signalProb.clamp(0, 100);

    String stage = '축적';
    int prog = abs;
    Color color = const Color(0xFF48D6A7);

    // 조작: ?�윕 리스?��? ?�거?? CHOCH가 ???�태?�서 ?�험???�라�???    if (risk >= 60 || st.contains('CHOCH') || st.contains('MSB')) {
      stage = '조작';
      prog = risk;
      color = const Color(0xFFB58BFF);
    }

    // 분배: BOS + ?�스/?�정?��? ?�을 ??    if (st.contains('BOS') && (force >= 55 || prob >= 70) && risk < 80) {
      stage = '분배';
      prog = math.max(force, prob).clamp(0, 100);
      color = const Color(0xFFFFC24D);
    }

    return _Po3Chip(stage: stage, progress: prog, color: color);
  }

  int _mtfAgreementPct() {
    final want = s.signalDir.toUpperCase();
    if (want != 'LONG' && want != 'SHORT') return 0;
    final keys = ['5m', '15m', '1h', '4h', '1D'];

    int total = 0;
    int ok = 0;
    for (final k in keys) {
      final p = s.mtfPulse[k];
      if (p == null) continue;
      total += 1;
      final dirOk = p.dir.toUpperCase() == want;
      final strengthOk = p.strength >= 55;
      final riskOk = p.risk < 70;
      if (dirOk && strengthOk && riskOk) ok += 1;
    }
    if (total == 0) return 0;
    return ((ok / total) * 100).round().clamp(0, 100);
  }

  String _whyLine(_ReactStat rs, int mtfPct, _Po3Chip po3) {
    final risk = s.sweepRisk.clamp(0, 100);
    if (s.locked) {
      return '관�?LOCK): ${s.lockedReason.isNotEmpty ? s.lockedReason : '조건 미충�?}';
    }
    if (mtfPct > 0 && mtfPct < 60) {
      return '관�? TF ?�의 ${mtfPct}% · PO3 ${po3.stage} · 반응 ${rs.pct}%';
    }
    if (!s.consensusOk) {
      return '관�? ?�중TF ?�의 부�?· 반응 ${rs.pct}%';
    }
    if (risk >= 65) {
      return '주의: ?�윕/?�탑?�트 리스??${risk}% · PO3 ${po3.stage}';
    }
    if (s.signalDir.toUpperCase() == 'NEUTRAL' || s.signalProb < 60) {
      return '관�? ?�정??부�?${s.signalProb}%) · 근거 ${s.evidenceHit}/${s.evidenceTotal}';
    }
    return '?�정 근접: TF ${mtfPct > 0 ? '${mtfPct}%' : 'OK'} · PO3 ${po3.stage} · 반응 ${rs.pct}%';
  }


  // v7: UI ?�벨 ?�동 LOCK ?�단 (FuState.locked?� 별개�??�시�?
  _LockRes _autoLock(_ReactStat rs, int mtfPct, _Po3Chip po3) {
    final risk = s.sweepRisk.clamp(0, 100);
    if (s.locked) {
      return _LockRes(true, s.lockedReason.isNotEmpty ? s.lockedReason : 'NO-TRADE ?�금');
    }
    if (!s.consensusOk || (mtfPct > 0 && mtfPct < 45)) {
      return _LockRes(true, '?�중TF 불일�?);
    }
    if (risk >= 70) {
      return _LockRes(true, '?�탑?�트 ?�험 ?�음');
    }
    // 조작(M) ?�계가 강하�?진입 차단
    if (po3.stage == '조작' && po3.progress < 80) {
      return _LockRes(true, 'PO3 조작 구간');
    }
    // ?�정??반응 부�?    if (s.signalProb < 55 && rs.pct < 55) {
      return _LockRes(true, '?�정??반응 부�?);
    }
    return _LockRes(false, '');
  }

  // v7: ?�력/체결 ?�착 1�??�리?�틱)
  String _flowLine(_ReactStat rs, int mtfPct, _Po3Chip po3) {
    final dir = s.signalDir.toUpperCase();
    final abs = s.absorptionScore.clamp(0, 100);
    final force = s.forceScore.clamp(0, 100);
    final risk = s.sweepRisk.clamp(0, 100);

    String grade(int v) => v >= 80 ? '�? : (v >= 60 ? '�? : (v >= 40 ? '?? : '미약'));

    final lock = _autoLock(rs, mtfPct, po3);
    if (lock.locked) return 'NO-TRADE: ${lock.why}';

    final absorbTag = grade(abs);
    final forceTag = grade(force);

    if (dir == 'LONG') {
      if (abs >= 65 && force >= 55 && risk < 65) return '매수 ?�착(${absorbTag}?�수/${forceTag}?? · 반응 ${rs.pct}%';
      if (abs >= 60) return '매수 ?�수 감�?(${absorbTag}) · ?�정 ?��?;
      return '매수 준�? 반응 ${rs.pct}% · TF ${mtfPct > 0 ? '${mtfPct}%' : 'OK'}';
    }

    if (dir == 'SHORT') {
      if (abs >= 65 && force >= 55 && risk < 65) return '매도 ?�착(${absorbTag}?�수/${forceTag}?? · 반응 ${rs.pct}%';
      if (abs >= 60) return '매도 ?�수 감�?(${absorbTag}) · ?�정 ?��?;
      return '매도 준�? 반응 ${rs.pct}% · TF ${mtfPct > 0 ? '${mtfPct}%' : 'OK'}';
    }

    return '중립: 반응 ${rs.pct}% · 리스??${risk}%';
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

    final rs = _calcReactStat();
    final po3 = _po3();
    final mtfPct = _mtfAgreementPct();
    final why = _whyLine(rs, mtfPct, po3);

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
              Text('?�정??, style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 12)),
              const SizedBox(width: 6),
              Text(_pctStr(), style: TextStyle(color: accent, fontSize: 14, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          Text('?�착: $flowHint', style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 12, fontWeight: FontWeight.w900)),
          if (s.finalDecisionReason.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                s.finalDecisionReason,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white.withOpacity(0.60), fontSize: 11, fontWeight: FontWeight.w900),
              ),
            ),

          const SizedBox(height: 8),

          // PO3 / TF ?�의 �?          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ChipPill(
                label: 'PO3 ${po3.stage}',
                value: '${po3.progress}%',
                color: po3.color,
              ),
              _ChipPill(
                label: 'TF ?�의',
                value: mtfPct == 0 ? '-' : '${mtfPct}%',
                color: (mtfPct >= 60) ? accent : const Color(0xFFB7BDC6),
              ),
              _ChipPill(
                label: '반응',
                value: rs.touches == 0 ? '-' : '${rs.pct}%',
                color: (rs.pct >= 70) ? const Color(0xFF48D6A7) : const Color(0xFFB7BDC6),
              ),
              if (rs.touches > 0)
                _ChipPill(
                  label: '?�균',
                  value: '${rs.avgMovePct.toStringAsFixed(2)}%',
                  color: const Color(0xFFB7BDC6),
                ),
            ],
          ),

          const SizedBox(height: 10),

          // ???�센??          Container(
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
                  s.signalKo.isNotEmpty ? s.signalKo : '결정 ?�약',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 12),
                ),
                const SizedBox(height: 6),
                Text(
                  why,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // v8: 반응구간 ?�트�?+ 100% ?�각??          ReactionHeatmapPanel(s: s),

          const SizedBox(height: 10),

          // 근거 �?          ..._evRows().map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _EvBar(text: e.text, value: e.value, accent: accent),
            ),
          ),

          const SizedBox(height: 6),

          // 추천 (진입/?�절/목표)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.14),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withOpacity(0.06)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('추천', style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 12, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(child: _kv('진입', entry, accent)),
                    const SizedBox(width: 8),
                    Expanded(child: _kv('?�절', stop, const Color(0xFFFF7A7A))),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _kv('1�?, tps.isNotEmpty ? tps[0] : '-', const Color(0xFF48D6A7))),
                    const SizedBox(width: 8),
                    Expanded(child: _kv('2�?, tps.length > 1 ? tps[1] : '-', const Color(0xFF48D6A7))),
                    const SizedBox(width: 8),
                    Expanded(child: _kv('3�?, tps.length > 2 ? tps[2] : '-', const Color(0xFF48D6A7))),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // v11: ?�시�?체결/?�더�?고래/기�? �?빠른 ?�단??
          _FlowBars(
            tapeBuyPct: s.tapeBuyPct,
            obBuyPct: s.obImbalance,
            whaleBuyPct: s.whaleBuyPct,
            instBias: s.instBias,
            forceScore: s.forceScore,
            absorptionScore: s.absorptionScore,
            sweepRisk: s.sweepRisk,
            flowHint: s.flowHint,
            accent: accent,
          ),

          const SizedBox(height: 10),

          // 게이지 4�?          Row(
            children: [
              Expanded(child: _gauge('구조', g1, accent)),
              const SizedBox(width: 8),
              Expanded(child: _gauge('근거', g2, accent)),
              const SizedBox(width: 8),
              Expanded(child: _gauge('?�수', g3, accent)),
              const SizedBox(width: 8),
              Expanded(child: _gauge('?�력', g4, accent)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Text(k, style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w800)),
          const Spacer(),
          Text(v, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _gauge(String label, int v, Color accent) {
    final val = v.clamp(0, 100);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: val / 100.0),
              duration: const Duration(milliseconds: 280),
              builder: (context, v, _) {
                return LinearProgressIndicator(
                  value: v,
                  minHeight: 8,
                  backgroundColor: Colors.white.withOpacity(0.10),
                  valueColor: AlwaysStoppedAnimation<Color>(accent.withOpacity(0.85)),
                );
              },
            ),
          ),
          const SizedBox(height: 6),
          Text('$val%', style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _EvRow {
  final String text;
  final double value;
  _EvRow({required this.text, required this.value});
}

class _FlowBars extends StatelessWidget {
  final int tapeBuyPct;
  final int obBuyPct;
  final int whaleBuyPct;
  final int instBias;
  final int forceScore;
  final int absorptionScore;
  final int sweepRisk;
  final String flowHint;
  final Color accent;

  const _FlowBars({
    required this.tapeBuyPct,
    required this.obBuyPct,
    required this.whaleBuyPct,
    required this.instBias,
    required this.forceScore,
    required this.absorptionScore,
    required this.sweepRisk,
    required this.flowHint,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final bool flowMissing = (forceScore == 0 && absorptionScore == 0 && sweepRisk == 0 && tapeBuyPct == 50 && obBuyPct == 50 && whaleBuyPct == 50 && instBias == 50);

    int clamp01(int v) => v.clamp(0, 100);
    final t = clamp01(tapeBuyPct);
    final o = clamp01(obBuyPct);
    final w = clamp01(whaleBuyPct);
    final i = clamp01(instBias);
    final f = clamp01(forceScore);
    final a = clamp01(absorptionScore);
    final r = clamp01(sweepRisk);

    Color buyC(int v) => v >= 55 ? const Color(0xFF48D6A7) : const Color(0xFFB7BDC6);
    Color sellC(int v) => v <= 45 ? const Color(0xFFFF4D7D) : const Color(0xFFB7BDC6);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('체결/?�력', style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 12, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('리스??, style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 11, fontWeight: FontWeight.w800)),
              const SizedBox(width: 6),
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => IndicatorInfoSheet.open(
                  context,
                  id: 'sweep_risk',
                  value: r,
                  valueText: flowMissing ? '--' : '${r}%',
                  connected: !flowMissing,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  child: Text(flowMissing ? '--' : '${r}%', style: TextStyle(color: r >= 70 ? const Color(0xFFFF7A7A) : accent, fontSize: 11, fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _barRow(context, '체결 매수', t, buyC(t), sellC(t), id: 'tape_buy', missing: flowMissing),
          const SizedBox(height: 6),
          _barRow(context, '?�더�?매수', o, buyC(o), sellC(o), id: 'ob_buy', missing: flowMissing),
          const SizedBox(height: 6),
          _barRow(context, '고래 매수', w, buyC(w), sellC(w), id: 'whale_buy', missing: flowMissing),
          const SizedBox(height: 6),
          _barRow(context, '기�? 바이?�스', i, buyC(i), sellC(i), id: 'inst_bias', missing: flowMissing),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _miniChip(context, '?�수', a, const Color(0xFF48D6A7), id: 'absorb', missing: flowMissing || a == 0)),
              const SizedBox(width: 8),
              Expanded(child: _miniChip(context, '?�력', f, accent, id: 'force', missing: flowMissing || f == 0)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _barRow(BuildContext context, String label, int v, Color buy, Color sell, {required String id, required bool missing}) {
    final isBuy = v >= 50;
    final c = isBuy ? buy : sell;
    return Row(
      children: [
        SizedBox(
          width: 92,
          child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w800)),
        ),
        Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => IndicatorInfoSheet.open(
              context,
              id: id,
              value: v,
              valueText: missing ? '--' : '${v}%',
              connected: !missing,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: (missing ? 0 : v) / 100.0,
                minHeight: 8,
                backgroundColor: Colors.white.withOpacity(0.10),
                valueColor: AlwaysStoppedAnimation<Color>((missing ? const Color(0xFFB7BDC6) : c).withOpacity(0.92)),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 36,
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => IndicatorInfoSheet.open(
              context,
              id: id,
              value: v,
              valueText: missing ? '--' : '${v}%',
              connected: !missing,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(missing ? '--' : '${v}%', textAlign: TextAlign.right, style: TextStyle(color: missing ? const Color(0xFFB7BDC6) : c, fontSize: 11, fontWeight: FontWeight.w900)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _miniChip(BuildContext context, String label, int v, Color c, {required String id, required bool missing}) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => IndicatorInfoSheet.open(
        context,
        id: id,
        value: v,
        valueText: missing ? '--' : '${v}%',
        connected: !missing,
      ),
      child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: (missing ? const Color(0xFFB7BDC6) : c).withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: (missing ? const Color(0xFFB7BDC6) : c).withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: Colors.white.withOpacity(0.70), fontSize: 11, fontWeight: FontWeight.w800)),
          const Spacer(),
          Text(missing ? '--' : '$v%', style: TextStyle(color: missing ? const Color(0xFFB7BDC6) : c, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    ),
    );
  }
}

class _EvBar extends StatelessWidget {
  final String text;
  final double value;
  final Color accent;
  const _EvBar({required this.text, required this.value, required this.accent});

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white.withOpacity(0.80), fontSize: 12, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 8),
            Text('${v.toStringAsFixed(0)}%', style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.w900)),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: v / 100.0,
            minHeight: 8,
            backgroundColor: Colors.white.withOpacity(0.10),
            valueColor: AlwaysStoppedAnimation<Color>(accent.withOpacity(0.88)),
          ),
        ),
      ],
    );
  }
}


class _LockRes {
  final bool locked;
  final String why;
  const _LockRes(this.locked, this.why);
}

class _ReactStat {
  final int pct;
  final int touches;
  final double avgMovePct;
  _ReactStat({required this.pct, required this.touches, required this.avgMovePct});
}

class _Po3Chip {
  final String stage;
  final int progress;
  final Color color;
  _Po3Chip({required this.stage, required this.progress, required this.color});
}

class _ChipPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _ChipPill({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final String keyLabel = label.split(' ').first;
    final String? id = IndicatorInfoSheet.aliasToId(keyLabel) ?? IndicatorInfoSheet.aliasToId(label);
    final num? v = () {
      final cleaned = value.replaceAll('%', '').trim();
      return num.tryParse(cleaned);
    }();

    return Container(
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: id == null ? null : () => IndicatorInfoSheet.open(context, id: id, value: v, valueText: value),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: color.withOpacity(0.35)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: TextStyle(color: Colors.white.withOpacity(0.78), fontSize: 11, fontWeight: FontWeight.w800)),
              const SizedBox(width: 6),
              Text(value, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      ),
    );
  }

Widget _pill(String t) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0x22FFFFFF)),
      color: const Color(0x11000000),
    ),
    child: Text(t, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w900)),
  );
}

}
