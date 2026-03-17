import 'package:flutter/material.dart';
import '../../core/constants.dart';
import '../../core/timeframe.dart';
import 'chart_screen.dart';

/// PHASE A: 홈 화면 — "분석 시작" 버튼, 기본 BTCUSDT / m15
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fulink Pro'),
        centerTitle: true,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'AI 비트코인 분석·브리핑',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChartScreen(
                        symbol: Constants.defaultSymbol,
                        tf: Timeframe.m15,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.analytics_outlined),
                label: const Text('분석 시작'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  textStyle: const TextStyle(fontSize: 18),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
