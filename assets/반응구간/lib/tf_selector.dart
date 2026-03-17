
import 'package:flutter/material.dart';
import 'tf_labels.dart';

class TfSelector extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const TfSelector({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: tfLabels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final t = tfLabels[i];
          final active = t.key == value;
          return GestureDetector(
            onTap: () => onChanged(t.key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: active ? Colors.white70 : Colors.white24, width: 1),
                color: active ? const Color(0xFF121225) : const Color(0xFF0B0B0F),
              ),
              child: Row(
                children: [
                  Text(t.key, style: TextStyle(color: active ? Colors.white : Colors.white60, fontSize: 11, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 6),
                  Text(t.cn, style: TextStyle(color: active ? Colors.white : Colors.white60, fontSize: 11)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
