import 'dart:async';
import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/services/fu_engine.dart';
import '../../data/bitget/bitget_live_store.dart';
import 'ultra_home_screen.dart';

/// ✅ Fulink SUPER AI Shell
/// - '슈퍼AI' 탭: 한눈에 결론/진입1개/종가보드/신호등
/// - '기존' 탭: 기존 UltraHomeScreen 그대로 유지 (기능 삭제 없음)
class SuperAiShell extends StatefulWidget {
  const SuperAiShell({super.key});

  @override
  State<SuperAiShell> createState() => _SuperAiShellState();
}

class _SuperAiShellState extends State<SuperAiShell> {
  int _tab = 0;

  // 기본 심볼 (기존 앱과 동일)
  String symbol = 'BTCUSDT';

  final _engine = FuEngine();
  Timer? _timer;
  FuState? _state;
  DateTime? _updatedAt;

  @override
  void initState() {
    super.initState();
    // 실시간 티커 시작 (기존 로직 재사용)
    BitgetLiveStore.I.start(symbol: symbol);

    // 2초마다 엔진 업데이트 (Windows/Android 공통, 에러시 safeMode 유지)
    _timer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted) return;
      try {
        final s = await _engine.fetch(
          symbol: symbol,
          tf: '1h',
          allowNetwork: true,
          safeMode: true,
        );
        setState(() {
          _state = s;
          _updatedAt = DateTime.now();
        });
      } catch (_) {
        // 네트워크/파싱 실패 시 UI 유지 (죽지 않게)
        if (!mounted) return;
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          _SuperDashboard(
            symbol: symbol,
            state: _state,
            updatedAt: _updatedAt,
            onChangeSymbol: (v) {
              setState(() => symbol = v);
              BitgetLiveStore.I.start(symbol: v);
            },
          ),
          // ✅ 기존 화면 그대로 (삭제/변경 없음)
          const UltraHomeScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.auto_awesome),
            label: '슈퍼AI',
          ),
          NavigationDestination(
            icon: Icon(Icons.dashboard),
            label: '기존',
          ),
        ],
      ),
    );
  }
}

class _SuperDashboard extends StatelessWidget {
  final String symbol;
  final FuState? state;
  final DateTime? updatedAt;
  final ValueChanged<String> onChangeSymbol;

  const _SuperDashboard({
    required this.symbol,
    required this.state,
    required this.updatedAt,
    required this.onChangeSymbol,
  });

  @override
  Widget build(BuildContext context) {
    final px = BitgetLiveStore.I.lastPrice.value;
    final online = BitgetLiveStore.I.online.value;
    final s = state;

    final title = s?.decisionTitle ?? (online ? '분석중' : '연결확인');
    final longPct = (s?.longPct ?? 0).clamp(0, 100);
    final shortPct = (s?.shortPct ?? 0).clamp(0, 100);

    final entry = s?.entry ?? 0.0;
    final stop = s?.stop ?? 0.0;
    final target = s?.target ?? 0.0;

    final s1 = s?.s1 ?? 0.0;
    final r1 = s?.r1 ?? 0.0;
    final vwap = s?.vwap ?? 0.0;

    final updated = updatedAt == null
        ? '-'
        : '${updatedAt!.hour.toString().padLeft(2, '0')}:${updatedAt!.minute.toString().padLeft(2, '0')}:${updatedAt!.second.toString().padLeft(2, '0')}';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _TopLine(symbol: symbol, px: px, online: online, updated: updated, onChangeSymbol: onChangeSymbol),
            const SizedBox(height: 10),
            _DecisionCard(title: title, longPct: longPct, shortPct: shortPct),
            const SizedBox(height: 10),
            _Price4(px: px, s1: s1, r1: r1, vwap: vwap),
            const SizedBox(height: 10),
            _Action3(entry: entry, stop: stop, target: target),
            const SizedBox(height: 10),
            _EngineLights(updated: updated),
            const SizedBox(height: 10),
            Expanded(
              child: _HintPanel(),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopLine extends StatelessWidget {
  final String symbol;
  final double px;
  final bool online;
  final String updated;
  final ValueChanged<String> onChangeSymbol;

  const _TopLine({
    required this.symbol,
    required this.px,
    required this.online,
    required this.updated,
    required this.onChangeSymbol,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            '$symbol  |  ${online ? "실시간" : "오프라인"}  |  $updated',
            style: Theme.of(context).textTheme.labelLarge,
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 110,
          height: 36,
          child: DropdownButtonFormField<String>(
            value: symbol,
            items: const [
              DropdownMenuItem(value: 'BTCUSDT', child: Text('BTCUSDT')),
              DropdownMenuItem(value: 'ETHUSDT', child: Text('ETHUSDT')),
              DropdownMenuItem(value: 'SOLUSDT', child: Text('SOLUSDT')),
            ],
            onChanged: (v) {
              if (v != null) onChangeSymbol(v);
            },
            decoration: const InputDecoration(
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              border: OutlineInputBorder(),
            ),
          ),
        ),
      ],
    );
  }
}

class _DecisionCard extends StatelessWidget {
  final String title;
  final int longPct;
  final int shortPct;

  const _DecisionCard({required this.title, required this.longPct, required this.shortPct});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('결론', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _PctBar(label: '롱', pct: longPct)),
                const SizedBox(width: 10),
                Expanded(child: _PctBar(label: '숏', pct: shortPct)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PctBar extends StatelessWidget {
  final String label;
  final int pct;
  const _PctBar({required this.label, required this.pct});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label $pct%'),
        const SizedBox(height: 4),
        LinearProgressIndicator(value: (pct / 100).clamp(0.0, 1.0)),
      ],
    );
  }
}

class _Price4 extends StatelessWidget {
  final double px, s1, r1, vwap;
  const _Price4({required this.px, required this.s1, required this.r1, required this.vwap});

  Widget _box(BuildContext context, String t, double v) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.white12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 6),
            Text(v == 0.0 ? '-' : v.toStringAsFixed(2), style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _box(context, '현재가', px),
        const SizedBox(width: 8),
        _box(context, '지지', s1),
        const SizedBox(width: 8),
        _box(context, '저항', r1),
        const SizedBox(width: 8),
        _box(context, 'VWAP', vwap),
      ],
    );
  }
}

class _Action3 extends StatelessWidget {
  final double entry, stop, target;
  const _Action3({required this.entry, required this.stop, required this.target});

  @override
  Widget build(BuildContext context) {
    String fmt(double v) => v == 0.0 ? '-' : v.toStringAsFixed(2);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('행동', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () {},
                    child: const Text('들어가기'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonal(
                    onPressed: () {},
                    child: const Text('유지하기'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {},
                    child: const Text('정리하기'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text('진입: ${fmt(entry)}  |  손절: ${fmt(stop)}  |  목표: ${fmt(target)}'),
          ],
        ),
      ),
    );
  }
}

class _EngineLights extends StatelessWidget {
  final String updated;
  const _EngineLights({required this.updated});

  Widget _dot(bool on) => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: on ? Colors.greenAccent : Colors.redAccent,
          shape: BoxShape.circle,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final online = BitgetLiveStore.I.online.value;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Text('엔진 신호등  ·  $updated'),
            const Spacer(),
            _dot(online),
            const SizedBox(width: 6),
            const Text('가격'),
            const SizedBox(width: 12),
            _dot(true),
            const SizedBox(width: 6),
            const Text('분석'),
          ],
        ),
      ),
    );
  }
}

class _HintPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text('설명'),
            SizedBox(height: 8),
            Text('이 탭은 “기존 기능 삭제 없이” 슈퍼AI 대시보드를 추가한 화면입니다.'),
            SizedBox(height: 6),
            Text('기존 탭(기존)을 눌러 원래 앱 기능을 그대로 사용할 수 있습니다.'),
            SizedBox(height: 6),
            Text('슈퍼AI 탭은 Bitget 실시간 가격 + 엔진 요약을 한눈에 표시합니다.'),
          ],
        ),
      ),
    );
  }
}
