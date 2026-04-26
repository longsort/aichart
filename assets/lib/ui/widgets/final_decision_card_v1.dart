import 'package:flutter/material.dart';
// 기존 경로(../../theme)가 프로젝트 구조와 달라 Windows 빌드에서 파일을 못 찾는 문제가 있어
// 실제 존재하는 경로로 교정합니다.
import '../theme/neon_theme.dart';

class FinalDecisionCardV1 extends StatelessWidget {
  /// (선택) 상위 화면에서 넘겨주는 상태/엔진/메타 정보.
  /// ultra_home_screen.dart에서 `state:`를 넘기는 호출을 유지하기 위해 받기만 합니다.
  final dynamic state;

  final String title;
  final String status;

  const FinalDecisionCardV1({
    super.key,
    this.state,
    required this.title,
    required this.status,
  });

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(color: theme.fg, fontSize: 16)),
          const SizedBox(height: 8),
          Text(
            status,
            style: TextStyle(
              color: theme.fg,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
