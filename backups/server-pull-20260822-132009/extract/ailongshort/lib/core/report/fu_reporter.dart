
import '../models/fu_state.dart';
import '../utils/candle_close_util.dart';
import '../analysis/entry_planner.dart';
import '../settings/app_settings.dart';

class FuReporter {
  /// ë°˜ì´ˆë³??? ?¬ìš´ ë§?+ ?«ì(?•ë¥ /ê·¼ê±°) ì¶©ë¶„???¬í•¨
  static String build(FuState s, {
    required String symbol,
    required String tf,
    required bool locked,
    required String lockReason,
  }) {
    final dir = _dirKo(s.signalDir);
    final prob = s.signalProb.clamp(0, 100);
    final score = s.score.clamp(0, 100);
    final conf = s.confidence.clamp(0, 100);
    final risk = s.risk.clamp(0, 100);

    final hold = _supportHoldPct(s); // ì§€ì§€ ? ì?(ì¶”ì •)
    final breakp = 100 - hold;

    final now = _fmtPrice(s.price);
    final s1 = _fmtPrice(s.s1);
    final r1 = _fmtPrice(s.r1);
    final vwap = _fmtPrice(s.vwap);

    final rr = _rrApprox(s);

    final sb = StringBuffer();
    sb.writeln('?ìµœì¢?ë¶„ì„ ë¦¬í¬??B: ë°˜ì´ˆë³?????);
    sb.writeln('?¬ë³¼: $symbol   TF: $tf');
    sb.writeln('?„ì¬ê°€: $now');
    sb.writeln('');

    sb.writeln('1) ê²°ë¡ (??ì¤?');
    if (locked) {
      sb.writeln('- ?íƒœ: ê±°ë˜ê¸ˆì?(NO-TRADE)');
      sb.writeln('- ?´ìœ : ${lockReason.isEmpty ? 'ë¦¬ìŠ¤??? ë¢° ì¡°ê±´ ë¶ˆì¶©ì¡? : lockReason}');
    } else {
      sb.writeln('- ?íƒœ: $dir (?•ë¥  ${prob}%)');
    }
    sb.writeln('');

    sb.writeln('2) ?µì‹¬ ?ˆë²¨');
    sb.writeln('- ì§€ì§€(?„ë˜): $s1');
    sb.writeln('- ?‰ê· ??VWAP): $vwap');
    sb.writeln('- ?€????: $r1');
    sb.writeln('');

    sb.writeln('3) ?ìˆ˜/? ë¢°/?„í—˜');
    sb.writeln('- ?ìˆ˜: $score / 100');
    sb.writeln('- ? ë¢°: $conf / 100');
    sb.writeln('- ?„í—˜: $risk / 100');
    sb.writeln('');

    sb.writeln('4) ì§€ì§€ ? ì? vs ë¶•ê´´(ì¶”ì •)');
    sb.writeln('- ì§€ì§€ ? ì? ê°€?¥ì„±: $hold%');
    sb.writeln('- ì§€ì§€ ë¶•ê´´ ê°€?¥ì„±: $breakp%');
    sb.writeln('  * ?´ì„: ? ì?ê°€ 60%?‘ë©´ ?œë°©???°ì„¸?? ë¶•ê´´ê°€ 60%?‘ë©´ ?œê¹¨ì§??•ë¥  ?°ì„¸??);
    sb.writeln('');

    sb.writeln('5) ê·¼ê±°(ìµœë? 5ê°?');
    final bullets = (s.signalBullets.isNotEmpty ? s.signalBullets : _fallbackBullets(s)).take(5).toList();
    if (bullets.isEmpty) {
      sb.writeln('- (ê·¼ê±° ?°ì´???†ìŒ) SAFE ëª¨ë“œ?????ˆìŒ');
    } else {
      for (var i=0;i<bullets.length;i++) {
        sb.writeln('- ${i+1}) ${_humanize(bullets[i])}');
      }
    }
    sb.writeln('');

    sb.writeln('6) ì´ˆë³´ ?‰ë™ ê°€?´ë“œ(ê·œì¹™)');
    sb.writeln('- SL(?ì ˆ) ë¨¼ì? ?•í•˜ê³??¤ì–´ê°€ê¸? SL ?†ëŠ” ì§„ì… ê¸ˆì?.');
    sb.writeln('- RR ìµœì†Œ 1:2 ?´ìƒë§? (?ì ˆ 1%ë©?ëª©í‘œ 2% ?´ìƒ)');
    sb.writeln('- ê³„ì¢Œ ë¦¬ìŠ¤??5% ê³ ì •. (ê°ì •ë§¤ë§¤ ë°©ì?)');
    sb.writeln('- ?œë§ˆê°?ìº”ë“¤ ì¢…ë£Œ)???„ì—???•ë¥ ????²Œ ë³´ê³  ë³´ìˆ˜?ìœ¼ë¡?');
    sb.writeln('');

    sb.writeln('7) ì°¸ê³  ì§€??ê°„ë‹¨)');
    sb.writeln('- ê·¼ê±° ì¶©ì¡±: ${s.evidenceHit}/${s.evidenceTotal}');
    sb.writeln('- RR(?€??: ${rr.toStringAsFixed(2)}');
    sb.writeln('');
    
    sb.writeln('8) ë§ˆê°(ìº”ë“¤ ì¢…ë£Œ) ì²´í¬');
    final i4 = CandleCloseUtil.evaluate(tfLabel: '4H', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1d = CandleCloseUtil.evaluate(tfLabel: '1D', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1w = CandleCloseUtil.evaluate(tfLabel: '1W', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    final i1m = CandleCloseUtil.evaluate(tfLabel: '1M', price: s.price, vwap: s.vwap, score: score, confidence: conf, risk: risk);
    sb.writeln('- 4H: ${i4.verdict} (?¨ì??œê°„ ${CandleCloseUtil.fmtRemain(i4.remaining)})  / ${i4.reason}');
    sb.writeln('- 1D: ${i1d.verdict} (?¨ì??œê°„ ${CandleCloseUtil.fmtRemain(i1d.remaining)})  / ${i1d.reason}');
    sb.writeln('- 1W: ${i1w.verdict} (?¨ì??œê°„ ${CandleCloseUtil.fmtRemain(i1w.remaining)})  / ${i1w.reason}');
    sb.writeln('- 1M: ${i1m.verdict} (?¨ì??œê°„ ${CandleCloseUtil.fmtRemain(i1m.remaining)})  / ${i1m.reason}');
    sb.writeln('');

    sb.writeln('9) ì§„ì… ?Œëœ(ì´ˆë³´??');
    final isLong = (s.decisionTitle.toLowerCase().contains('long') || s.decisionTitle.contains('ë¡?));
    final plan = EntryPlanner.plan(isLong: isLong, price: s.price, s1: s.s1, r1: s.r1, accountUsdt: AppSettings.accountUsdt, riskPct: AppSettings.riskPct);
    sb.writeln('- ENTRY: ${plan.entry.toStringAsFixed(1)}  / SL: ${plan.sl.toStringAsFixed(1)}');
    sb.writeln('- TP: ${plan.tp1.toStringAsFixed(1)} / ${plan.tp2.toStringAsFixed(1)} / ${plan.tp3.toStringAsFixed(1)}');
    sb.writeln('- RR: ${plan.rr1.toStringAsFixed(2)} / ${plan.rr2.toStringAsFixed(2)} / ${plan.rr3.toStringAsFixed(2)}');
    sb.writeln('- ì¶”ì²œ ?ˆë²„ë¦¬ì?: ${plan.leverageRec.toStringAsFixed(0)}x  | ?¬ì??? ${plan.qtyBtc.toStringAsFixed(4)} BTC  | ì¦ê±°ê¸? ${plan.marginUsdt.toStringAsFixed(2)} USDT');
    sb.writeln('');
sb.writeln('??ë³?ë¦¬í¬?¸ëŠ” ?ë™ë§¤ë§¤ê°€ ?„ë‹ˆ???œë¶„??ê°€?´ë“œ?ì…?ˆë‹¤. 100%???†ìŠµ?ˆë‹¤.');

    return sb.toString();
  }

  static String _dirKo(String d) {
    final x = d.toUpperCase();
    if (x.contains('LONG')) return 'ë¡??ìŠ¹) ?°ì„¸';
    if (x.contains('SHORT')) return '???˜ë½) ?°ì„¸';
    return 'ì¤‘ë¦½(ê´€ë§?';
  }

  static String _fmtPrice(double v) {
    if (v.isNaN || v.isInfinite) return '-';
    // ?•ìˆ˜ì²˜ëŸ¼ ë³´ì´ë©??Œìˆ˜ ?œê±°
    final iv = v.roundToDouble();
    if ((v - iv).abs() < 0.0001) return iv.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  static int _supportHoldPct(FuState s) {
    // ê°„ë‹¨ ì¶”ì •: ? ë¢°?? ?„í—˜?? ê·¼ê±°?? ?ìˆ˜?‘ë©´ ? ì? ?•ë¥ ??    final e = (s.evidenceTotal <= 0) ? 0.0 : (s.evidenceHit / s.evidenceTotal).clamp(0.0, 1.0);
    final hold = 20
      + (s.confidence * 0.35)
      + (s.score * 0.25)
      + (e * 20)
      + ((100 - s.risk) * 0.20);
    return hold.round().clamp(0, 100);
  }

  static double _rrApprox(FuState s) {
    // ?€??RR: (r1 - price) / (price - s1) for long; for short inverse
    final price = s.price;
    final s1 = s.s1;
    final r1 = s.r1;
    if (price <= 0) return 0;
    final dir = s.signalDir.toUpperCase();
    if (dir.contains('SHORT')) {
      final reward = (price - s1).abs();
      final risk = (r1 - price).abs();
      if (risk <= 0) return 0;
      return reward / risk;
    } else {
      final reward = (r1 - price).abs();
      final risk = (price - s1).abs();
      if (risk <= 0) return 0;
      return reward / risk;
    }
  }

  static List<String> _fallbackBullets(FuState s) {
    final out = <String>[];
    if (s.evidenceHit >= 3) out.add('ê·¼ê±°ê°€ ${s.evidenceHit}ê°??´ìƒ ì¶©ì¡±(ì´ˆë³´ ê¸°ì? ?µê³¼ ê°€??');
    if (s.risk >= 70) out.add('?„í—˜???’ìŒ: ?ì ˆ?¸ê¸°/ê¸‰ë???ì£¼ì˜');
    if (s.confidence <= 30) out.add('? ë¢°ê°€ ??Œ: ê´€ë§?ì¶”ì²œ');
    out.add('ì§€ì§€/?€??êµ¬ê°„ ì¤‘ì‹¬?¼ë¡œë§??ë‹¨(êµ¬ê°„ ë°–ì? ì¤‘ë¦½)');
    return out;
  }

  static String _humanize(String raw) {
    var s = raw;
    s = s.replaceAll('FVG', 'ë¹ˆêµ¬ê°?ê¸‰ë“±/ê¸‰ë½ ?”ì )');
    s = s.replaceAll('BPR', '?˜ëŒë¦??µì‹¬êµ¬ê°„');
    s = s.replaceAll('liquidity', '? ë™??ë¬¼ëŸ‰??ëª°ë¦° ?ë¦¬)');
    s = s.replaceAll('stop-hunt', '?ì ˆ?¸ê¸°(?¨ì •)');
    s = s.replaceAll('OB', 'ì£¼ë¬¸/ë¬¼ëŸ‰ êµ¬ê°„');
    s = s.replaceAll('CVD', 'ë§¤ìˆ˜/ë§¤ë„ ?°ìœ„');
    s = s.replaceAll('VWAP', '?‰ê· ??VWAP)');
    return s;
  }
}
