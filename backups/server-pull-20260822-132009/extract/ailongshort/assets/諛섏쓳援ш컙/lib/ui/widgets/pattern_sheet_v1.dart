import 'package:flutter/material.dart';

import 'neon_theme.dart';

enum PatternSetMode { pro8, ty15 }

class PatternPick {
  final String key;
  final String name;
  final String dirHint; // '상승'|'하락'|'중립'
  const PatternPick({required this.key, required this.name, required this.dirHint});
}

class PatternSheetV1 {
  static Future<void> open(
    BuildContext context, {
    required NeonTheme t,
    required String currentTf,
    required List<String> tfs,
    required PatternSetMode initialMode,
    required ValueChanged<PatternSetMode> onMode,
    required void Function(String tf, PatternSetMode mode, PatternPick pick) onPick,
  }) async {
    final mode = await showModalBottomSheet<PatternSetMode>(
      context: context,
      backgroundColor: t.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _ModeSheet(t: t, initial: initialMode),
    );
    if (mode == null) return;
    onMode(mode);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: t.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) {
        return _ListSheet(
          t: t,
          currentTf: currentTf,
          tfs: tfs,
          mode: mode,
          onPick: (tf, pick) => onPick(tf, mode, pick),
        );
      },
    );
  }
}

class _ModeSheet extends StatelessWidget {
  final NeonTheme t;
  final PatternSetMode initial;
  const _ModeSheet({required this.t, required this.initial});

  @override
  Widget build(BuildContext context) {
    Widget card({required String title, required String sub, required PatternSetMode mode}) {
      final selected = mode == initial;
      return InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.pop(context, mode),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: t.bg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? t.accent.withOpacity(0.8) : t.border.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              Icon(Icons.layers, color: selected ? t.accent : t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 4),
                    Text(sub, style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(Icons.chevron_right, color: t.muted),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('AI 패턴 모드', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 16)),
              const Spacer(),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close, color: t.muted),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('원하는 패턴 세트를 선택하세요.', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          card(
            title: '실전 최강 8종 (기본)',
            sub: '빠르고 깔끔 · 노이즈 최소 · 추천',
            mode: PatternSetMode.pro8,
          ),
          const SizedBox(height: 10),
          card(
            title: '타이롱 풀세트 15종 (고급)',
            sub: '패턴 확장 · 후보 더 많음 · 고급용',
            mode: PatternSetMode.ty15,
          ),
        ],
      ),
    );
  }
}

class _ListSheet extends StatefulWidget {
  final NeonTheme t;
  final String currentTf;
  final List<String> tfs;
  final PatternSetMode mode;
  final void Function(String tf, PatternPick pick) onPick;
  const _ListSheet({required this.t, required this.currentTf, required this.tfs, required this.mode, required this.onPick});

  @override
  State<_ListSheet> createState() => _ListSheetState();
}

class _ListSheetState extends State<_ListSheet> {
  late String tf;
  bool hiOnly = false;

  @override
  void initState() {
    super.initState();
    tf = widget.currentTf;
  }

  List<PatternPick> _base8() {
    return const [
      PatternPick(key: 'triangle', name: '삼각수렴', dirHint: '중립'),
      PatternPick(key: 'wedge_up', name: '상승쐐기', dirHint: '하락'),
      PatternPick(key: 'wedge_dn', name: '하락쐐기', dirHint: '상승'),
      PatternPick(key: 'bull_flag', name: '불플래그', dirHint: '상승'),
      PatternPick(key: 'bear_flag', name: '베어플래그', dirHint: '하락'),
      PatternPick(key: 'channel', name: '채널', dirHint: '중립'),
      PatternPick(key: 'double_top', name: '더블탑', dirHint: '하락'),
      PatternPick(key: 'double_bottom', name: '더블바텀', dirHint: '상승'),
    ];
  }

  List<PatternPick> _ty15() {
    return const [
      PatternPick(key: 'triangle', name: '삼각수렴', dirHint: '중립'),
      PatternPick(key: 'wedge_up', name: '상승쐐기', dirHint: '하락'),
      PatternPick(key: 'wedge_dn', name: '하락쐐기', dirHint: '상승'),
      PatternPick(key: 'bull_flag', name: '불플래그', dirHint: '상승'),
      PatternPick(key: 'bear_flag', name: '베어플래그', dirHint: '하락'),
      PatternPick(key: 'channel', name: '채널', dirHint: '중립'),
      PatternPick(key: 'double_top', name: '더블탑', dirHint: '하락'),
      PatternPick(key: 'double_bottom', name: '더블바텀', dirHint: '상승'),
      PatternPick(key: 'hs', name: '헤드앤숄더', dirHint: '하락'),
      PatternPick(key: 'inv_hs', name: '역헤드앤숄더', dirHint: '상승'),
      PatternPick(key: 'cup_handle', name: '컵앤핸들', dirHint: '상승'),
      PatternPick(key: 'range_box', name: '박스(레인지)', dirHint: '중립'),
      PatternPick(key: 'exp_wedge', name: '확장쐐기', dirHint: '중립'),
      PatternPick(key: 'diamond', name: '다이아몬드', dirHint: '중립'),
      PatternPick(key: 'brk_retest', name: '돌파/리테스트', dirHint: '중립'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final items = widget.mode == PatternSetMode.pro8 ? _base8() : _ty15();

    final filtered = <PatternPick>[];
    for (final p in items) {
      // hiOnly는 실제 점수 연동되면 적용. 지금은 UI 스위치만 제공.
      if (hiOnly) {
        if (p.key == 'triangle' || p.key == 'wedge_dn' || p.key == 'double_bottom') {
          filtered.add(p);
        }
      } else {
        filtered.add(p);
      }
    }

    Widget tfChip(String v) {
      final sel = v == tf;
      return InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => tf = v),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: sel ? t.accent.withOpacity(0.16) : t.bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: sel ? t.accent.withOpacity(0.8) : t.border.withOpacity(0.35)),
          ),
          child: Text(v, style: TextStyle(color: sel ? t.accent : t.muted, fontWeight: FontWeight.w800, fontSize: 12)),
        ),
      );
    }

    Widget row(PatternPick p) {
      final Color c = p.dirHint == '상승' ? t.good : (p.dirHint == '하락' ? t.bad : t.accent);
      return InkWell(
        onTap: () {
          widget.onPick(tf, p);
          Navigator.pop(context);
        },
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: t.bg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.border.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(99)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Text('힌트: ${p.dirHint}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text('보기', style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 12)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: t.muted),
            ],
          ),
        ),
      );
    }

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 14,
          right: 14,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 14,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(widget.mode == PatternSetMode.pro8 ? '실전 8종' : '타이롱 15종', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 16)),
                const Spacer(),
                IconButton(onPressed: () => Navigator.pop(context), icon: Icon(Icons.close, color: t.muted)),
              ],
            ),
            const SizedBox(height: 6),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final x in widget.tfs) ...[tfChip(x), const SizedBox(width: 8)],
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('고확률만', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w800)),
                const SizedBox(width: 8),
                Switch(
                  value: hiOnly,
                  onChanged: (v) => setState(() => hiOnly = v),
                  activeColor: t.accent,
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.55,
              child: ListView(
                children: [
                  for (final p in filtered) row(p),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
