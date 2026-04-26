import 'package:flutter/material.dart';

/// 빈 공간을 자동으로 채우는 "스마트 배치" 래퍼.
/// - 넓은 화면: 가로로 여러 카드
/// - 좁은 화면: 세로로 내려감
class AutoFillStrip extends StatelessWidget {
  final List<Widget> children;
  final double spacing;
  final double runSpacing;

  const AutoFillStrip({
    super.key,
    required this.children,
    this.spacing = 10,
    this.runSpacing = 10,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, c) {
        final wide = c.maxWidth >= 900;

        if (!wide) {
          return Column(
            children: [
              for (int i = 0; i < children.length; i++) ...[
                children[i],
                if (i != children.length - 1) SizedBox(height: runSpacing),
              ],
            ],
          );
        }

        final itemW = (c.maxWidth - spacing) / 2;
        return Wrap(
          spacing: spacing,
          runSpacing: runSpacing,
          children: children.map((w) => SizedBox(width: itemW, child: w)).toList(),
        );
      },
    );
  }
}
