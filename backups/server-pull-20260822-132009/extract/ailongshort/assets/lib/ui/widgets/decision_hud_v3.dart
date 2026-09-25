import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class DecisionHudV3 extends StatelessWidget {
  final FuState s;
  const DecisionHudV3({super.key, required this.s});

  String _titleKo() {
    final t = s.decisionTitle.trim();
    if (t.isNotEmpty) return t;
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return '롱 확정';
    if (dir == 'SHORT') return '숏 확정';
    return '관망';
  }

  Color _accent() {
    final dir = s.signalDir.toUpperCase();
    if (dir == 'LONG') return const Color(0xFF3EF6C6);
    if (dir == 'SHORT') return const Color(0xFFFF4D7D);
    return const Color(0xFFFFB020);
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
      rows.add(_EvRow(text: '근거가 부족합니다 (신호 대기)', value: base * 0.40));
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
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.78),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withOpacity(0.55), width: 1.2),
        boxShadow: [
          BoxShadow(color: accent.withOpacity(0.12), blurRadius: 18, spreadRadius: 1, offset: const Offset(0, 8)),
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
                  style: TextStyle(color: accent, fontWeight: FontWeight.w800, letterSpacing: 0.2),
                ),
              ),
              const Spacer(),
              Text('확정 확률', style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 12)),
              const SizedBox(width: 6),
              Text(_pctStr(), style: TextStyle(color: accent, fontSize: 14, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 10),

          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent.withOpacity(0.18), Colors.transparent],
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
                  s.signalKo.isNotEmpty ? s.signalKo : '근거 기반 판단',
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
          const SizedBox(height: 10),

          const _SectionTitle(icon: Icons.flag, text: '추천'),
          const SizedBox(height: 6),
          _RecGrid(accent: accent, entry: entry, stop: stop, tps: tps),

          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(child: _MiniGauge(label: '정도', value: g1, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '구조일치도', value: g2, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '유동성 흡수', value: g3, accent: accent)),
              const SizedBox(width: 8),
              Expanded(child: _MiniGauge(label: '파동 상승', value: g4, accent: accent)),
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
