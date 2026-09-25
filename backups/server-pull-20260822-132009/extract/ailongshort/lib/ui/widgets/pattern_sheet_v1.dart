import 'package:flutter/material.dart';

import 'neon_theme.dart';

enum PatternSetMode { pro8, ty15 }

class PatternPick {
  final String key;
  final String name;
  final String dirHint; // '?ìŠ¹'|'?˜ë½'|'ì¤‘ë¦½'
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
              Text('AI ?¨í„´ ëª¨ë“œ', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 16)),
              const Spacer(),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close, color: t.muted),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('?í•˜???¨í„´ ?¸íŠ¸ë¥?? íƒ?˜ì„¸??', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          card(
            title: '?¤ì „ ìµœê°• 8ì¢?(ê¸°ë³¸)',
            sub: 'ë¹ ë¥´ê³?ê¹”ë” Â· ?¸ì´ì¦?ìµœì†Œ Â· ì¶”ì²œ',
            mode: PatternSetMode.pro8,
          ),
          const SizedBox(height: 10),
          card(
            title: '?€?´ë¡± ?€?¸íŠ¸ 15ì¢?(ê³ ê¸‰)',
            sub: '?¨í„´ ?•ì¥ Â· ?„ë³´ ??ë§ìŒ Â· ê³ ê¸‰??,
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
      PatternPick(key: 'triangle', name: '?¼ê°?˜ë ´', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'wedge_up', name: '?ìŠ¹?ê¸°', dirHint: '?˜ë½'),
      PatternPick(key: 'wedge_dn', name: '?˜ë½?ê¸°', dirHint: '?ìŠ¹'),
      PatternPick(key: 'bull_flag', name: 'ë¶ˆí”Œ?˜ê·¸', dirHint: '?ìŠ¹'),
      PatternPick(key: 'bear_flag', name: 'ë² ì–´?Œë˜ê·?, dirHint: '?˜ë½'),
      PatternPick(key: 'channel', name: 'ì±„ë„', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'double_top', name: '?”ë¸”??, dirHint: '?˜ë½'),
      PatternPick(key: 'double_bottom', name: '?”ë¸”ë°”í?', dirHint: '?ìŠ¹'),
    ];
  }

  List<PatternPick> _ty15() {
    return const [
      PatternPick(key: 'triangle', name: '?¼ê°?˜ë ´', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'wedge_up', name: '?ìŠ¹?ê¸°', dirHint: '?˜ë½'),
      PatternPick(key: 'wedge_dn', name: '?˜ë½?ê¸°', dirHint: '?ìŠ¹'),
      PatternPick(key: 'bull_flag', name: 'ë¶ˆí”Œ?˜ê·¸', dirHint: '?ìŠ¹'),
      PatternPick(key: 'bear_flag', name: 'ë² ì–´?Œë˜ê·?, dirHint: '?˜ë½'),
      PatternPick(key: 'channel', name: 'ì±„ë„', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'double_top', name: '?”ë¸”??, dirHint: '?˜ë½'),
      PatternPick(key: 'double_bottom', name: '?”ë¸”ë°”í?', dirHint: '?ìŠ¹'),
      PatternPick(key: 'hs', name: '?¤ë“œ?¤ìˆ„??, dirHint: '?˜ë½'),
      PatternPick(key: 'inv_hs', name: '??—¤?œì•¤?„ë”', dirHint: '?ìŠ¹'),
      PatternPick(key: 'cup_handle', name: 'ì»µì•¤?¸ë“¤', dirHint: '?ìŠ¹'),
      PatternPick(key: 'range_box', name: 'ë°•ìŠ¤(?ˆì¸ì§€)', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'exp_wedge', name: '?•ì¥?ê¸°', dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'diamond', name: '?¤ì´?„ëª¬??, dirHint: 'ì¤‘ë¦½'),
      PatternPick(key: 'brk_retest', name: '?ŒíŒŒ/ë¦¬í…Œ?¤íŠ¸', dirHint: 'ì¤‘ë¦½'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final items = widget.mode == PatternSetMode.pro8 ? _base8() : _ty15();

    final filtered = <PatternPick>[];
    for (final p in items) {
      // hiOnly???¤ì œ ?ìˆ˜ ?°ë™?˜ë©´ ?ìš©. ì§€ê¸ˆì? UI ?¤ìœ„ì¹˜ë§Œ ?œê³µ.
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
      final Color c = p.dirHint == '?ìŠ¹' ? t.good : (p.dirHint == '?˜ë½' ? t.bad : t.accent);
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
                    Text('?ŒíŠ¸: ${p.dirHint}', style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text('ë³´ê¸°', style: TextStyle(color: t.muted, fontWeight: FontWeight.w800, fontSize: 12)),
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
                Text(widget.mode == PatternSetMode.pro8 ? '?¤ì „ 8ì¢? : '?€?´ë¡± 15ì¢?, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 16)),
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
                Text('ê³ í™•ë¥ ë§Œ', style: TextStyle(color: t.muted, fontSize: 12, fontWeight: FontWeight.w800)),
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
