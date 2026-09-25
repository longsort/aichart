import 'dart:ui';
import 'package:flutter/material.dart';

import 'neon_theme.dart';

class UltraTopBarV1 extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String symbol;
  final String tf;
  final ValueChanged<String>? onChangeSymbol;
  final VoidCallback? onOpenSettings;
  final VoidCallback? onOpenPattern;
  final VoidCallback? onOpenSignals;
  final VoidCallback? onOpenTradeChart;
  final VoidCallback? onOpenGlossary;

  const UltraTopBarV1({
    super.key,
    required this.title,
    required this.symbol,
    required this.tf,
    this.onChangeSymbol,
    this.onOpenSettings,
    this.onOpenPattern,
    this.onOpenSignals,
    this.onOpenTradeChart,
    this.onOpenGlossary,
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return SafeArea(
      bottom: false,
      child: ClipRRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          color: t.bg.withOpacity(0.55),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              t.bg.withOpacity(0.65),
              t.card.withOpacity(0.35),
            ],
          ),
          border: Border(
            bottom: BorderSide(color: t.border.withOpacity(0.35), width: 1),
          ),
        ),
        child: Row(
          children: [
            Text(
              title,
              style: TextStyle(
                color: t.fg,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: t.card,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: t.border.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  Text(symbol, style: TextStyle(color: t.fg, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 10),
                  Text(tf, style: TextStyle(color: t.muted, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              tooltip: '패턴',
              onPressed: onOpenPattern,
              icon: Icon(Icons.auto_graph, color: t.muted),
            ),
            const SizedBox(width: 2),
            IconButton(
              tooltip: '신호',
              onPressed: onOpenSignals,
              icon: Icon(Icons.traffic, color: t.muted),
            ),
            const SizedBox(width: 2),
            IconButton(
              tooltip: '지표사전',
              onPressed: onOpenGlossary,
              icon: Icon(Icons.help_outline_rounded, color: t.muted),
            ),
            const SizedBox(width: 2),
            // 전체화면(차트 크게) 버튼은 확대/축소 시 캔들 짤림/왜곡 이슈가 있어
            // 메인 차트 안정화 전까지 UI에서 제거한다.
            // (라우팅/콜백은 남겨두되 버튼만 숨김)
            IconButton(
              tooltip: '설정',
              onPressed: onOpenSettings,
              icon: Icon(Icons.settings, color: t.muted),
            ),
            if (onChangeSymbol != null) ...[
              const SizedBox(width: 10),
              IconButton(
                tooltip: '코인 변경',
                onPressed: () async {
                  final v = await showDialog<String>(
                    context: context,
                    builder: (ctx) {
                      final c = TextEditingController(text: symbol);
                      return AlertDialog(
                        backgroundColor: t.card,
                        title: Text('코인', style: TextStyle(color: t.fg)),
                        content: TextField(
                          controller: c,
                          style: TextStyle(color: t.fg),
                          decoration: const InputDecoration(hintText: 'BTCUSDT'),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('취소'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, c.text.trim()),
                            child: const Text('확인'),
                          ),
                        ],
                      );
                    },
                  );
                  if (v != null && v.trim().isNotEmpty) onChangeSymbol!(v.trim());
                },
                icon: Icon(Icons.tune, color: t.muted),
              ),
            ],
          ],
        ),
      ),
    ),
  ),
);
  }
}
