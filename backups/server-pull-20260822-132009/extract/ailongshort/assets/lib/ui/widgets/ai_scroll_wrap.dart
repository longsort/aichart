import 'package:flutter/material.dart';

/// 패널 오버플로 방지(우측 카드 컬럼을 항상 스크롤 가능하게)
class AiScrollWrap extends StatelessWidget {
  final Widget child;
  const AiScrollWrap({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        return SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: c.maxHeight),
            child: child,
          ),
        );
      },
    );
  }
}
