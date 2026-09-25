import 'package:flutter/material.dart';
import 'realtime_gauge.dart';

class DataCollectGauge extends StatelessWidget {
  final double progress; // 0~100
  const DataCollectGauge({super.key, required this.progress});

  @override
  Widget build(BuildContext context) {
    return RealtimeGauge(
      value: progress,
      label: '데이터 수집 상태',
    );
  }
}