
import 'package:flutter/material.dart';

import '../../core/models/fu_state.dart';
import '../widgets/info_rail_v2.dart';
import '../widgets/action_space_v1.dart';
import '../widgets/price_space_v1.dart';

/// WAR ULTIMATE LAYOUT (Real Flutter UI)
/// - PRICE SPACE 40%: candles + structure + zones (NO text)
/// - CONTEXT RAIL 10%: all numbers / labels (text only)
/// - ACTION SPACE 50%: decision / scenarios / risk (text & micro bars)
class WarUltimatePage extends StatelessWidget {
  final FuState state;
  const WarUltimatePage({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0F14),
        foregroundColor: Colors.white,
        title: const Text('WAR ULTIMATE'),
      ),
      body: LayoutBuilder(
        builder: (context, c) {
          // Force stable proportions even if resized
          final w = c.maxWidth;
          final h = c.maxHeight;
          final priceW = w * 0.40;
          final railW = w * 0.10;
          final actionW = w - priceW - railW;

          return Row(
            children: [
              SizedBox(
                width: priceW,
                height: h,
                child: PriceSpaceV1(state: state),
              ),
              SizedBox(
                width: railW,
                height: h,
                child: InfoRailV2(state: state),
              ),
              SizedBox(
                width: actionW,
                height: h,
                child: ActionSpaceV1(state: state),
              ),
            ],
          );
        },
      ),
    );
  }
}
