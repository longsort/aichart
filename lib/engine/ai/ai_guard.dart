import '../core/core_engine.dart';

class AiGuardOut {
  final bool lock;
  final String reason;
  const AiGuardOut({required this.lock, required this.reason});
}

class AiGuard {
  AiGuardOut guard(CoreSnapshot s) {
    if (s.risk01 >= 0.7) return const AiGuardOut(lock: true, reason: 'RISK HIGH');
    if (s.whaleGrade == 'ULTRA' && s.risk01 >= 0.5) {
      return const AiGuardOut(lock: true, reason: 'ULTRA WHALE + RISK');
    }
    return const AiGuardOut(lock: false, reason: 'OK');
  }
}
