import 'package:flutter/material.dart';
import 'package:ailongshort/engine/learning/learning_intensity.dart';

class LearningIntensityCard extends StatelessWidget {
  const LearningIntensityCard({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<double>(
      valueListenable: LearningIntensity.I.alpha,
      builder: (_, a, __) {
        final pct = (a * 100).round();
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('AI ?™ìŠµ ?ë„', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                  const Spacer(),
                  Text('$pct%', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 6),
              const Text('?’ì„?˜ë¡ ?œìµœê·?ê²°ê³¼?ë? ??ê°•í•˜ê²?ë°˜ì˜?©ë‹ˆ??',
                  style: TextStyle(color: Colors.white54, fontSize: 11)),
              const SizedBox(height: 10),
              Slider(
                value: a,
                onChanged: (v) => LearningIntensity.I.alpha.value = v,
                min: 0.05,
                max: 0.95,
              ),
              const SizedBox(height: 2),
              Row(
                children: const [
                  Text('?ˆì •', style: TextStyle(color: Colors.white38, fontSize: 10)),
                  Spacer(),
                  Text('ê³µê²©', style: TextStyle(color: Colors.white38, fontSize: 10)),
                ],
              )
            ],
          ),
        );
      },
    );
  }
}