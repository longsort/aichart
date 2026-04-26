import '../models/engine_models.dart';

class StructureAI {
  // TODO: replace with real multi-TF structure logic
  StructureOutput analyze({required List<double> closes}) {
    if (closes.length < 10) {
      return const StructureOutput(bias: MarketBias.neutral, wave: "?", grade: "D");
    }
    final last = closes.last;
    final first = closes[closes.length - 10];
    final up = last > first;

    return StructureOutput(
      bias: up ? MarketBias.long : MarketBias.short,
      wave: up ? "2 of 5" : "B of ABC",
      grade: "B",
    );
  }
}
