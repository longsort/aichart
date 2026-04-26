import '../models/fu_state.dart';
import '../models/trade_verdict.dart';

/// 스펙 기반 "확정" 판정 + 1줄 결론 생성
///
/// 확정 조건(스펙):
/// - zoneValid>=60 && hasStructure && tfAgree && !noTrade
class DecisionEngineV1 {
  const DecisionEngineV1();

  TradeVerdict verdict(FuState s) {
    final int zv = s.zoneValidInt;
    final bool ok = (zv >= 60) && s.hasStructure && s.tfAgree && !s.noTrade;

    if (s.noTrade) {
      return TradeVerdict(
        action: TradeAction.NO_TRADE,
        title: 'NO-TRADE',
        reason: s.noTradeReason.isNotEmpty ? s.noTradeReason : '리스크/합의/범위 조건 미달',
      );
    }

    if (ok) {
      if (s.signalDir.toUpperCase().contains('LONG')) {
        return TradeVerdict(
          action: TradeAction.LONG,
          title: '롱 확정',
          reason: _reason(s, zv),
        );
      }
      if (s.signalDir.toUpperCase().contains('SHORT')) {
        return TradeVerdict(
          action: TradeAction.SHORT,
          title: '숏 확정',
          reason: _reason(s, zv),
        );
      }
    }

    // 기본: 관망
    final dir = s.signalDir.toUpperCase();
    final title = (dir.contains('LONG') && s.signalProb >= 65)
        ? '롱 주의'
        : (dir.contains('SHORT') && s.signalProb >= 65)
            ? '숏 주의'
            : '관망';

    return TradeVerdict(
      action: TradeAction.WAIT,
      title: title,
      reason: _reason(s, zv),
    );
  }

  String _reason(FuState s, int zv) {
    final parts = <String>[];
    parts.add('구간 $zv');
    parts.add(s.hasStructure ? '구조 OK' : '구조 X');
    parts.add(s.tfAgree ? 'TF 합의 OK' : 'TF 합의 X');
    if (s.flags['hasFvg'] == true) parts.add('FVG');
    if (s.flags['hasOb'] == true) parts.add('OB');
    if (s.flags['hasBpr'] == true) parts.add('BPR');
    if (s.flags['hasChoch'] == true) parts.add('CHOCH');
    if (s.flags['hasBos'] == true) parts.add('BOS');
    return parts.join(' · ');
  }
}
