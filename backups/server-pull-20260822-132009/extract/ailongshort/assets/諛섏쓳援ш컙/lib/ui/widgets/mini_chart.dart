import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../model/candle.dart';

class MiniChart extends StatelessWidget {
  const MiniChart({super.key, required this.candles, required this.height});

  final List<Candle> candles;
  final double height;

  @override
  Widget build(BuildContext context) {
    final pts = <FlSpot>[];
    for (int i = 0; i < candles.length; i++) {
      pts.add(FlSpot(i.toDouble(), candles[i].close));
    }
    if (pts.length < 2) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text(
            '차트 데이터 없음',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      );
    }
    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          gridData: const FlGridData(show: false),
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          lineBarsData: [
            LineChartBarData(
              spots: pts,
              isCurved: true,
              barWidth: 2,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(show: true, gradient: LinearGradient(colors: [
                Colors.cyan.withOpacity(0.25),
                Colors.transparent,
              ])),
              gradient: const LinearGradient(colors: [Colors.cyan, Colors.greenAccent]),
            ),
          ],
        ),
      ),
    );
  }
}
