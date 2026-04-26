
import 'package:flutter/material.dart';
import '../../core/runtime/trade_mode.dart';

class TradeModeToggle extends StatelessWidget {
  final TradeMode mode;
  final ValueChanged<TradeMode> onChanged;

  const TradeModeToggle({super.key, required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.shield, size: 14, color: Colors.white70),
        const SizedBox(width: 6),
        DropdownButtonHideUnderline(
          child: DropdownButton<TradeMode>(
            value: mode,
            dropdownColor: Colors.black87,
            items: TradeMode.values
                .map((m) => DropdownMenuItem(
                      value: m,
                      child: Text(m.label, style: const TextStyle(color: Colors.white)),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ),
      ]),
    );
  }
}
