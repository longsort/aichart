
import 'package:flutter/material.dart';
import '../core/position_state.dart';

class PositionProgressGauge extends StatelessWidget {
  final PositionState state;
  const PositionProgressGauge({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    Color barColor = Colors.blueGrey;
    String label = 'IN POSITION';

    if (state.isSuccess) {
      barColor = Colors.greenAccent;
      label = 'SUCCESS';
    } else if (state.isFail) {
      barColor = Colors.redAccent;
      label = 'FAILED';
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(color: barColor, fontSize: 16)),
        const SizedBox(height: 6),
        LinearProgressIndicator(
          value: state.progress,
          minHeight: 10,
          backgroundColor: Colors.black,
          valueColor: AlwaysStoppedAnimation(barColor),
        ),
      ],
    );
  }
}
