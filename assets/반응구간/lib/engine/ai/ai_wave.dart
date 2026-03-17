import '../core/core_engine.dart';

class AiWaveOut {
  final String phase; // P1..P4
  final int strength; // 0..100
  const AiWaveOut({required this.phase, required this.strength});
}

class AiWave {
  AiWaveOut wave(CoreSnapshot s) {
    final m = s.momentum;
    final strength = (m.abs() * 100).round().clamp(0, 100);
    final phase = (m >= 0)
        ? (strength > 70 ? 'P3' : strength > 35 ? 'P2' : 'P1')
        : (strength > 70 ? 'P4' : strength > 35 ? 'P2' : 'P1');
    return AiWaveOut(phase: phase, strength: strength);
  }
}
