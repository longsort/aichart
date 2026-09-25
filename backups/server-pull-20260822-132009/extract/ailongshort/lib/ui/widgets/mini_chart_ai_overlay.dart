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
    final color = state.contains('Îß§Ïàò')
        ? Colors.green
        : state.contains('Îß§ÎèÑ')
            ? Colors.red
            : Colors.orange;

    return Positioned(
      right: 6,
      top: 6,
      bottom: 6,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _bar('Î°?, longScore, Colors.green),
          const SizedBox(height: 6),
          _bar('??, shortScore, Colors.red),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              // ?∞Ï∏° ?ÅÎã® %???úÎã§??1/3/5Î¥??ïÎ•†?ùÏù¥ ?ÑÎãà??
              // ?ÑÏû¨ TF?êÏÑú Í∑ºÍ±∞(Ï¶ùÍ±∞) ?©ÏÇ∞?ºÎ°ú Í≥ÑÏÇ∞??**?Ä??Ï¢ÖÌï© ?†Î¢∞??** ??
              '$state ¬∑ ?Ä??${confidence.toStringAsFixed(0)}%',
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