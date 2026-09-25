import 'dart:async';
import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../../core/services/fu_engine.dart';
import '../../data/bitget/bitget_live_store.dart';
import 'ultra_home_screen.dart';

/// ??Fulink SUPER AI Shell
/// - '?ˆí¼AI' ?? ?œëˆˆ??ê²°ë¡ /ì§„ì…1ê°?ì¢…ê?ë³´ë“œ/? í˜¸??/// - 'ê¸°ì¡´' ?? ê¸°ì¡´ UltraHomeScreen ê·¸ë?ë¡?? ì? (ê¸°ëŠ¥ ?? œ ?†ìŒ)
class SuperAiShell extends StatefulWidget {
  const SuperAiShell({super.key});

  @override
  State<SuperAiShell> createState() => _SuperAiShellState();
}

class _SuperAiShellState extends State<SuperAiShell> {
  int _tab = 0;

  // ê¸°ë³¸ ?¬ë³¼ (ê¸°ì¡´ ?±ê³¼ ?™ì¼)
  String symbol = 'BTCUSDT';

  final _engine = FuEngine();
  Timer? _timer;
  FuState? _state;
  DateTime? _updatedAt;

  @override
  void initState() {
    super.initState();
    // ?¤ì‹œê°??°ì»¤ ?œì‘ (ê¸°ì¡´ ë¡œì§ ?¬ì‚¬??
    BitgetLiveStore.I.start(symbol: symbol);

    // 2ì´ˆë§ˆ???”ì§„ ?…ë°?´íŠ¸ (Windows/Android ê³µí†µ, ?ëŸ¬??safeMode ? ì?)
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
        // ?¤íŠ¸?Œí¬/?Œì‹± ?¤íŒ¨ ??UI ? ì? (ì£½ì? ?Šê²Œ)
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
          // ??ê¸°ì¡´ ?”ë©´ ê·¸ë?ë¡?(?? œ/ë³€ê²??†ìŒ)
          const UltraHomeScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.auto_awesome),
            label: '?ˆí¼AI',
          ),
          NavigationDestination(
            icon: Icon(Icons.dashboard),
            label: 'ê¸°ì¡´',
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

    final title = s?.decisionTitle ?? (online ? 'ë¶„ì„ì¤? : '?°ê²°?•ì¸');
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
            '$symbol  |  ${online ? "?¤ì‹œê°? : "?¤í”„?¼ì¸"}  |  $updated',
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
            Text('ê²°ë¡ ', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _PctBar(label: 'ë¡?, pct: longPct)),
                const SizedBox(width: 10),
                Expanded(child: _PctBar(label: '??, pct: shortPct)),
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
        _box(context, '?„ì¬ê°€', px),
        const SizedBox(width: 8),
        _box(context, 'ì§€ì§€', s1),
        const SizedBox(width: 8),
        _box(context, '?€??, r1),
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
            Text('?‰ë™', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () {},
                    child: const Text('?¤ì–´ê°€ê¸?),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.tonal(
                    onPressed: () {},
                    child: const Text('? ì??˜ê¸°'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {},
                    child: const Text('?•ë¦¬?˜ê¸°'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text('ì§„ì…: ${fmt(entry)}  |  ?ì ˆ: ${fmt(stop)}  |  ëª©í‘œ: ${fmt(target)}'),
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
            Text('?”ì§„ ? í˜¸?? Â·  $updated'),
            const Spacer(),
            _dot(online),
            const SizedBox(width: 6),
            const Text('ê°€ê²?),
            const SizedBox(width: 12),
            _dot(true),
            const SizedBox(width: 6),
            const Text('ë¶„ì„'),
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
            Text('?¤ëª…'),
            SizedBox(height: 8),
            Text('????? ?œê¸°ì¡?ê¸°ëŠ¥ ?? œ ?†ì´???ˆí¼AI ?€?œë³´?œë? ì¶”ê????”ë©´?…ë‹ˆ??'),
            SizedBox(height: 6),
            Text('ê¸°ì¡´ ??ê¸°ì¡´)???ŒëŸ¬ ?ë˜ ??ê¸°ëŠ¥??ê·¸ë?ë¡??¬ìš©?????ˆìŠµ?ˆë‹¤.'),
            SizedBox(height: 6),
            Text('?ˆí¼AI ??? Bitget ?¤ì‹œê°?ê°€ê²?+ ?”ì§„ ?”ì•½???œëˆˆ???œì‹œ?©ë‹ˆ??'),
          ],
        ),
      ),
    );
  }
}
