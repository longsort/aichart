import 'package:flutter/material.dart';

import '../data/indicator_glossary.dart';

class IndicatorInfoSheet {
  static IndicatorDef? byId(String id) {
    for (final d in kIndicatorGlossary) {
      if (d.id == id) return d;
    }
    return null;
  }

  static String? aliasToId(String label) => kIndicatorAliases[label];

  /// 값이 더미/미연결로 보이면 true
  static bool looksUnconnected({
    required String id,
    num? value,
    bool? connected,
  }) {
    if (connected == false) return true;
    if (value == null) return true;
    // flow 계열 기본값 50 고정/흡수·세력 0 고정 상황 대비
    if (id == 'tape_buy' || id == 'ob_buy' || id == 'whale_buy' || id == 'inst_bias') {
      return value.toDouble() == 50.0;
    }
    if (id == 'absorb' || id == 'force' || id == 'whale_score' || id == 'liquidity' || id == 'decision_power') {
      return value.toDouble() == 0.0;
    }
    return false;
  }

  static void open(
    BuildContext context, {
    required String id,
    String? label,
    num? value,
    String? valueText,
    List<String> reasons = const [],
    bool? connected,
  }) {
    final def = byId(id);
    if (def == null) return;

    final theme = Theme.of(context);
    final unconnected = looksUnconnected(id: id, value: value, connected: connected);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.62,
          minChildSize: 0.45,
          maxChildSize: 0.92,
          builder: (ctx2, sc) {
            return Container(
              decoration: BoxDecoration(
                color: theme.colorScheme.surface.withOpacity(0.96),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
                border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.10)),
              ),
              child: ListView(
                controller: sc,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 5,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.onSurface.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(def.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                            const SizedBox(height: 6),
                            Text(def.oneLine, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.70), fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                      if (valueText != null || value != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.10)),
                          ),
                          child: Text(
                            unconnected ? '--' : (valueText ?? value.toString()),
                            style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _Section(title: '의미', text: def.meaning),
                  if (def.howToRead.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _BulletSection(title: '해석', items: def.howToRead),
                  ],
                  if (reasons.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _BulletSection(title: '왜 이렇게 나왔나', items: reasons),
                  ],
                  if (unconnected) ...[
                    const SizedBox(height: 14),
                    _BulletSection(
                      title: '현재 상태',
                      items: const [
                        '데이터/계산이 미연결로 보입니다(기본값 고정/0% 고정).',
                        '연결되면 “--”가 실제 수치로 바뀝니다.',
                      ],
                    ),
                  ],
                  if (def.notes.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _BulletSection(title: '비고', items: def.notes),
                  ],
                  const SizedBox(height: 18),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('닫기'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String text;
  const _Section({required this.title, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(text, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.onSurface.withOpacity(0.78))),
        ],
      ),
    );
  }
}

class _BulletSection extends StatelessWidget {
  final String title;
  final List<String> items;
  const _BulletSection({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          ...items.map(
            (s) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w900)),
                  Expanded(child: Text(s, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.onSurface.withOpacity(0.78)))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
