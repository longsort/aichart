import 'package:flutter/material.dart';
import '../../core/timeframe.dart';

class TfSelector extends StatelessWidget {
  final Timeframe value;
  final ValueChanged<Timeframe?> onChanged;

  const TfSelector({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return DropdownButton<Timeframe>(
      value: value,
      items: Timeframe.values.map((tf) {
        return DropdownMenuItem(value: tf, child: Text(tf.code));
      }).toList(),
      onChanged: (v) => onChanged(v),
    );
  }
}
