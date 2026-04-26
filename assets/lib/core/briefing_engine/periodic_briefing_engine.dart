import '../models/fu_state.dart';
import '../utils/kst_close_util.dart';
import 'periodic_briefing_db.dart';

/// 주/월/년(및 일) 마감 기준으로 “기간 당 1회” 생성되는 브리핑 엔진.
/// - 다른 사람 브리핑 카피 금지: 행동/금지/구간/트리거 중심.
/// - LIVE가 아니면 생성하지 않음(가짜 데이터로 확정/브리핑 금지).
class PeriodicBriefingEngine {
  static const List<String> _tfs = ['1d', '1w', '1m', '1y'];

  static bool isPeriodicTf(String tf) {
    final t = tf.toLowerCase().trim();
    return _tfs.contains(t);
  }

  /// 지금 시점(nowKst)에서, 해당 TF의 “직전 마감(close)”을 기준으로
  /// 브리핑이 없으면 생성해서 반환.
  static Future<PeriodicBriefingRow?> ensure({
    required String tf,
    required FuState state,
  }) async {
    final t = tf.toLowerCase().trim();
    if (!_tfs.contains(t)) return null;
    if (!state.candles.isNotEmpty) return null;

    final nowKst = KstCloseUtil.nowKst();
    final close = _prevCloseKst(t, nowKst);
    final key = _key(t, close);

    final exists = await PeriodicBriefingDB.getByKey(key);
    if (exists != null) return exists;

    final row = PeriodicBriefingRow(
      key: key,
      tf: t,
      closeTsKst: close.millisecondsSinceEpoch,
      title: _title(t, close),
      body: _body(t, close, state),
      notified: 0,
    );
    await PeriodicBriefingDB.upsert(row);
    return row;
  }

  static DateTime _prevCloseKst(String tf, DateTime nowKst) {
    // next close can be today/next period; prev close is one step back
    final next = KstCloseUtil.nextCloseKst(tf);
    if (tf == '1d') {
      final prev = next.subtract(const Duration(days: 1));
      // if 아직 오늘 09:00 이전이면 prev는 전날 09:00이지만, 그게 직전 마감이 맞다.
      return prev;
    }
    if (tf == '1w') {
      return next.subtract(const Duration(days: 7));
    }
    if (tf == '1m') {
      final y = next.year;
      final m = next.month;
      final prevMonth = (m == 1) ? DateTime(y - 1, 12, 1, 9) : DateTime(y, m - 1, 1, 9);
      return prevMonth;
    }
    if (tf == '1y') {
      return DateTime(next.year - 1, 1, 1, 9);
    }
    return next.subtract(const Duration(days: 1));
  }

  static String _key(String tf, DateTime closeKst) {
    final d = '${closeKst.year.toString().padLeft(4, '0')}-'
        '${closeKst.month.toString().padLeft(2, '0')}-'
        '${closeKst.day.toString().padLeft(2, '0')}';
    return '${tf}_$d';
  }

  static String _title(String tf, DateTime closeKst) {
    final d = '${closeKst.year}.${closeKst.month.toString().padLeft(2, '0')}.${closeKst.day.toString().padLeft(2, '0')}';
    if (tf == '1d') return '일간 브리핑 · $d 마감';
    if (tf == '1w') return '주간 브리핑 · $d 마감';
    if (tf == '1m') return '월간 브리핑 · $d 마감';
    if (tf == '1y') return '연간 브리핑 · $d 마감';
    return '브리핑 · $d 마감';
  }

  static String _body(String tf, DateTime closeKst, FuState s) {
    // 문체: 행동/금지/구간/트리거 중심(카피 금지)
    final p = s.signalProb.clamp(0, 100);
    final risk = s.risk.clamp(0, 100);
    final riskTag = (risk >= 70) ? '높음' : (risk <= 35) ? '낮음' : '보통';
    final s1 = s.s1;
    final r1 = s.r1;
    final rl = s.reactLow;
    final rh = s.reactHigh;
    final hasBand = (rl > 0 && rh > 0);
    final band = hasBand ? '${rl.toStringAsFixed(1)}~${rh.toStringAsFixed(1)}' : '-';

    final whale = s.whaleScore;
    final force = s.forceScore;
    final inst = s.instBias;
    final sweep = s.sweepRisk;

    String action;
    if (s.locked) {
      action = '이번 기간은 “무리 금지”가 우선입니다.';
    } else if (s.showSignal && s.expectedRoiPct >= 25) {
      action = '이번 기간은 “확정 신호가 나올 때만” 따라갑니다.';
    } else {
      action = '이번 기간은 “관망 → 구간 도달 시만 판단”입니다.';
    }

    final buf = StringBuffer();
    buf.writeln(action);
    buf.writeln('• 핵심 구간: 지지 ${s1.toStringAsFixed(1)} · 반응구간 $band · 저항 ${r1.toStringAsFixed(1)}');
    buf.writeln('• 위험: $riskTag (스윕 $sweep) · 확률 참고 $p%');
    if (tf == '1y') {
      buf.writeln('• 연간 원칙: 추격 금지 / 유리구간(반응구간)만 접근');
    } else if (tf == '1m') {
      buf.writeln('• 월간 원칙: 고점부 무리 금지 / 반등 실패 시 방어');
    } else if (tf == '1w') {
      buf.writeln('• 주간 원칙: 한 방향으로만 길게(역방향 추격 금지)');
    } else {
      buf.writeln('• 일간 원칙: 마감 기준으로만 확정(중간 흔들림 무시)');
    }
    if (whale >= 70 || force >= 70 || inst >= 70) {
      buf.writeln('• 흐름: 고래 $whale / 세력 $force / 기관 $inst → 유입 신호 ↑');
    } else {
      buf.writeln('• 흐름: 큰손 신호는 중립(무리 금지)');
    }
    buf.writeln('• 체크: 결정가격 ${s.breakLevel > 0 ? s.breakLevel.toStringAsFixed(1) : '-'} 위/아래 마감 확인');
    return buf.toString().trim();
  }
}
