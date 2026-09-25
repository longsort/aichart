import 'dart:io';
import 'package:flutter/material.dart';

/// 차트 이미지(캡쳐) 붙여넣기 카드
/// - 외부 패키지 없이: 파일 경로를 붙여넣으면 미리보기
class ChartCaptureCard extends StatelessWidget {
  final String? imagePath;
  final VoidCallback onPick;
  final VoidCallback onClear;
  final String pickLabel;

  const ChartCaptureCard({
    super.key,
    required this.imagePath,
    required this.onPick,
    required this.onClear,
    this.pickLabel = '이미지 선택',
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.30),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('차트 캡쳐 분석(간편)',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          Row(
            children: [
              ElevatedButton(onPressed: onPick, child: Text(pickLabel)),
              const SizedBox(width: 10),
              TextButton(onPressed: onClear, child: const Text('지우기')),
            ],
          ),
          const SizedBox(height: 10),
          if (imagePath == null || imagePath!.isEmpty)
            const Text('사용법: 버튼을 눌러 차트 캡쳐 이미지를 선택하면 미리보기가 떠요.',
                style: TextStyle(color: Colors.white70))
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(
                File(imagePath!),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Text('이미지 열기 실패(경로 확인)',
                    style: TextStyle(color: Colors.white70)),
              ),
            ),
          const SizedBox(height: 10),
          const Text('※ 분석은 “캔들 기반 타이롱 + 핵심구간” 결과로 자동 연결됩니다.',
              style: TextStyle(color: Colors.white54, fontSize: 12)),
        ],
      ),
    );
  }
}
