import 'package:flutter/material.dart';

class MiniChartAIOverlay extends StatelessWidget {
  final double longScore;
  final double shortScore;
  final String state;
  final double confidence;

  const MiniChartAIOverlay({
    super.key,
    required this.longScore,
    required this.shortScore,
    required this.state,
    required this.confidence,
  });

  @override
  Widget build(BuildContext context) {
    final color = state.contains('매수')
        ? Colors.green
        : state.contains('매도')
            ? Colors.red
            : Colors.orange;

    return Positioned(
      right: 6,
      top: 6,
      bottom: 6,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _bar('롱', longScore, Colors.green),
          const SizedBox(height: 6),
          _bar('숏', shortScore, Colors.red),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              // 우측 상단 %는 “다음 1/3/5봉 확률”이 아니라,
              // 현재 TF에서 근거(증거) 합산으로 계산된 **타점(종합 신뢰도)** 다.
              '$state · 타점 ${confidence.toStringAsFixed(0)}%',
              style: TextStyle(color: color, fontSize: 11),
            ),
          )
        ],
      ),
    );
  }

  Widget _bar(String label, double v, Color c) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10)),
        Container(
          width: 12,
          height: 70,
          decoration: BoxDecoration(
            border: Border.all(color: c.withOpacity(0.4)),
            borderRadius: BorderRadius.circular(6),
          ),
          alignment: Alignment.bottomCenter,
          child: Container(
            width: 12,
            height: 70 * (v.clamp(0, 100) / 100),
            decoration: BoxDecoration(
              color: c,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
        ),
      ],
    );
  }
}