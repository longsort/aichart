
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class HelpSheetV1 extends StatelessWidget {
  final String symbol;
  final String tf;
  final bool safeMode;
  final String? lastError;

  const HelpSheetV1({
    super.key,
    required this.symbol,
    required this.tf,
    required this.safeMode,
    required this.lastError,
  });

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    Widget line(String txt) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(txt, style: TextStyle(color: theme.fg, fontSize: 13, height: 1.25)),
        );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: theme.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('초보 도움말', style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 16)),
              const SizedBox(height: 10),
              line('현재: $symbol / $tf'),
              line('• “점수/신뢰/위험”은 참고용입니다. 100%는 없습니다.'),
              line('• 초보 기준: (1) 근거 5개 중 최소 3개 (2) SL 먼저 (3) RR≥1:2 (4) 계좌 5% 리스크'),
              line('• 거래금지(NO-TRADE)면 쉬세요. 이게 초보가 돈 지키는 방법입니다.'),
              if (lastError != null) ...[
                const SizedBox(height: 6),
                Text('마지막 에러', style: TextStyle(color: theme.warn, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                SelectableText(lastError!, style: TextStyle(color: theme.warn)),
              ],
              const SizedBox(height: 10),
              Text('SAFE 모드: ${safeMode ? '켜짐' : '꺼짐'}', style: TextStyle(color: theme.muted)),
            ],
          ),
        ),
      ),
    );
  }
}
