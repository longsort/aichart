
import 'package:flutter/material.dart';
import '../../engine/trade/trade_state.dart';

class TradeStateBadge extends StatelessWidget{
  final TradeState state;
  const TradeStateBadge({super.key, required this.state});

  Color get color {
    switch(state){
      case TradeState.longReady: return Colors.greenAccent;
      case TradeState.shortReady: return Colors.redAccent;
      case TradeState.noTrade: return Colors.orangeAccent;
      case TradeState.collecting: return Colors.blueAccent;
      case TradeState.inPosition: return Colors.purpleAccent;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context){
    return Container(
      padding: const EdgeInsets.symmetric(horizontal:12, vertical:6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color),
      ),
      child: Text(
        state.name.toUpperCase(),
        style: TextStyle(color: color, fontWeight: FontWeight.bold),
      ),
    );
  }
}
