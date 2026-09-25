
import 'package:flutter/widgets.dart';
import '../../engine/central_engine.dart';

class EngineHudBind extends StatelessWidget {
  final Widget Function(int,double,double) builder;
  const EngineHudBind({super.key, required this.builder});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: CentralEngine.evidenceCount,
      builder: (_, ev, __) {
        return ValueListenableBuilder<double>(
          valueListenable: CentralEngine.longRate,
          builder: (_, l, __) {
            return ValueListenableBuilder<double>(
              valueListenable: CentralEngine.shortRate,
              builder: (_, s, __) {
                return builder(ev,l,s);
              },
            );
          },
        );
      },
    );
  }
}
