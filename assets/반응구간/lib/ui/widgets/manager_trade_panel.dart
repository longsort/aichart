import 'package:flutter/material.dart';

import '../../core/app_settings.dart';
import '../../core/models/fu_state.dart';
import '../../core_ai/super_agi_v6/ev_calculator_v6.dart';
import '../../core_ai/super_agi_v6/position_sizer_v6.dart';
import '../../core_ai/super_agi_v6/stop_hunt_calculator_v6.dart';

/// 미니차트 바로 아래에 붙는 "매니저" 패널.
/// - 시드(USDT) 입력
/// - 5% 리스크 기준 (엔진이 계산한 entry/stop/target/leverage/qty) 표시
/// - 멀티 타임프레임(5m~1M) 요약을 한 화면에서
class ManagerTradePanel extends StatefulWidget {
  final String symbol;

  /// 현재 화면에서 선택된 타임프레임 (상단 탭과 동일)
  final String currentTf;

  /// { '5m': FuState, '15m': FuState, ... }
  final Map<String, FuState> tfSnap;

  /// 시드 변경 시, 부모에서 엔진 재계산 트리거
  final VoidCallback onSeedChanged;

  const ManagerTradePanel({
    super.key,
    required this.symbol,
    required this.currentTf,
    required this.tfSnap,
    required this.onSeedChanged,
  });

  @override
  State<ManagerTradePanel> createState() => _ManagerTradePanelState();
}

class _AgiGateResult {
  /// 화면 표시용 단계(한글)
  /// - 확정: 진입 가능(근거 충분)
  /// - 주의: 준비/관망(근거 부족)
  /// - 잠금: 거래 금지(위험)
  final String level; // '확정' / '주의' / '잠금'
  final String message;
  final Color color;
  const _AgiGateResult(this.level, this.message, this.color);
}

class _ManagerTradePanelState extends State<ManagerTradePanel> {
  late final TextEditingController _seedCtrl;

  // ============================
  // Step4: 확정 신호 게이트(남발 방지)
  // - CONFIRM: EV↑ + 헌팅위험↓ + 레버 과도X + 방향 명확
  // - CAUTION: 조건 일부 부족(관망/주의)
  // - LOCK: NO-TRADE/위험 과다
  // ============================
  _AgiGateResult _agiGate({
    required FuState f,
    required int dir,
    required double evR,
    required double huntRisk,
    required double leverage,
  }) {
    if (f.noTrade) {
      return const _AgiGateResult('잠금', '거래 금지', Color(0xFFFF7E7E));
    }

    // 치명 조건
    if (evR < 0 || huntRisk >= 70 || leverage >= 80) {
      return const _AgiGateResult('잠금', '위험 높음', Color(0xFFFF7E7E));
    }

    // 주의 조건
    final caution = (evR < 0.10) || (huntRisk >= 50) || (leverage >= 40) || (dir == 0);
    if (caution) {
      final why = (huntRisk >= 50)
          ? '헌팅 위험'
          : (evR < 0.10)
              ? 'EV 약함'
              : (leverage >= 40)
                  ? '레버 과다'
                  : '방향 불명확';
      return _AgiGateResult('주의', why, const Color(0xFFA8B4D6));
    }

    // 확정
    final dirKo = (dir == 1) ? '롱(위쪽)' : '숏(아래쪽)';
    final col = (dir == 1) ? const Color(0xFF33D18C) : const Color(0xFFFF5B5B);
    return _AgiGateResult('확정', '$dirKo 진입 가능', col);
  }

  static const _order = <String>['5m', '15m', '1h', '4h', '1D', '1W', '1M'];

  @override
  void initState() {
    super.initState();
    _seedCtrl = TextEditingController(text: AppSettings.accountUsdt.toStringAsFixed(0));
  }

  @override
  void dispose() {
    _seedCtrl.dispose();
    super.dispose();
  }

  void _applySeed() {
    final raw = _seedCtrl.text.trim().replaceAll(',', '');
    final v = double.tryParse(raw);
    if (v == null || v <= 0) return;
    AppSettings.accountUsdt = v;
    widget.onSeedChanged();
    setState(() {});
  }

  // ============================
  // 한글 매니저 브리핑(근거 기반)
  // - 영어/전문용어 최소화
  // - 엔진이 이미 계산한 값만 사용(없는 말 금지)
  // ============================
  String _koSituation({required FuState f, required int dir, required bool hasZone}) {
    final trend = switch (f.structureTag) {
      'BOS_UP' || 'CHOCH_UP' || 'MSB_UP' => '상승 흐름',
      'BOS_DN' || 'CHOCH_DN' || 'MSB_DN' => '하락 흐름',
      _ => '박스 흐름',
    };
    final dirKo = (dir == 1)
        ? '롱 쪽 우세'
        : (dir == -1)
            ? '숏 쪽 우세'
            : '방향 애매';
    if (!hasZone || f.reactLow <= 0 || f.reactHigh <= 0) {
      return '$trend · $dirKo';
    }
    final px = f.price;
    final inBand = (px >= f.reactLow && px <= f.reactHigh);
    final bandTxt = inBand ? '반응 구간 안' : '반응 구간 밖';
    return '$trend · $dirKo · $bandTxt';
  }

  String _koReason({required FuState f, required double evR, required double huntRisk}) {
    final why = f.signalWhy.trim();
    if (why.isNotEmpty) return why;
    final flow = f.flowHint.trim();
    if (flow.isNotEmpty) return flow;
    if (evR < 0) return '기대값이 낮아 조심';
    if (huntRisk >= 50) return '흔들기 위험이 있어 대기';
    return '근거가 더 쌓이면 안내';
  }

  List<String> _evidenceBullets({required FuState f, required double evR, required double huntRisk}) {
    // 1) 엔진이 만든 bullet이 있으면 최우선
    final base = f.signalBullets.map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    if (base.isNotEmpty) return base.take(6).toList();

    // 2) 없으면, FuState 숫자만으로 간단 근거 생성
    final out = <String>[];
    if (f.s1 > 0 && f.r1 > 0) out.add('가격 구간: 아래 ${f.s1.toStringAsFixed(0)} / 위 ${f.r1.toStringAsFixed(0)}');
    if (f.vwap > 0) out.add('평균선: ${f.vwap.toStringAsFixed(0)}');
    out.add('호가 힘: 매수 ${f.obImbalance}% / 매도 ${100 - f.obImbalance}%');
    out.add('체결 힘: 매수 ${f.tapeBuyPct}% / 매도 ${100 - f.tapeBuyPct}%');
    out.add('큰 자금 힘: ${f.forceScore}/100');
    out.add('흔들기 위험: ${f.sweepRisk}/100');
    out.add('기대값: ${evR >= 0 ? '+' : ''}${evR.toStringAsFixed(2)}점');
    out.add('리스크 신호: ${huntRisk.toStringAsFixed(0)}/100');
    return out.take(6).toList();
  }

  List<String> _nextActions({required String gateLevel, required int dir, required bool hasZone}) {
    final dirKo = (dir == 1)
        ? '롱'
        : (dir == -1)
            ? '숏'
            : '방향';
    if (gateLevel == '확정') {
      return <String>[
        '$dirKo 진입 준비',
        '손절 먼저',
        '익절 1·2·3 나눔',
      ];
    }
    if (gateLevel == '잠금') {
      return <String>[
        '관망',
        '시간대 바꾸기',
        hasZone ? '반응 구간 재확인' : '구간 다시 잡기',
      ];
    }
    // 주의
    return <String>[
      hasZone ? '반응 구간 대기' : '구간 형성 대기',
      '돌파/이탈 확인',
      '흔들기 경계',
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final seed = AppSettings.accountUsdt;
    // AppSettings.riskPct는 5.0(%) 형태로 저장됨 → 계산에는 0.05로 변환
    final riskPct = (AppSettings.riskPct / 100.0);
    final risk = seed * riskPct;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.9)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0D1220),
            Color(0xFF0B1326),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('매니저 자동 브리핑', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              _pill(
                '리스크 5%: ${risk.toStringAsFixed(0)} USDT',
                bg: const Color(0xFF151B2C),
                fg: const Color(0xFFA8B4D6),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _seedBox(theme),
              ),
              const SizedBox(width: 10),
              SizedBox(
                height: 42,
                child: ElevatedButton(
                  onPressed: _applySeed,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E2A4A),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: const Text('적용'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _legend(theme),
          const SizedBox(height: 10),
          // ✅ Step3: 미니차트 아래 '실시간 2줄 매니저 스트립' (엔진 전체 기능 요약)
          _superAgiStrip(theme, widget.currentTf, widget.tfSnap[widget.currentTf]),
          const SizedBox(height: 10),
          // ✅ 현재 선택된 TF 요약 (사용자가 미니차트만 봐도 바로 판단)
          _currentTfSummary(theme, widget.currentTf, widget.tfSnap[widget.currentTf]),
          const SizedBox(height: 10),
          ..._order.map((tf) => _tfRow(theme, tf, widget.tfSnap[tf])).toList(),
        ],
      ),
    );
  }

  Widget _currentTfSummary(ThemeData theme, String tf, FuState? f) {
    if (f == null) {
      return _pill('현재 TF($tf) 데이터 없음', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6));
    }
    final dir = _dirKorean(f);
    final dirClr = _dirColor(f, theme);
final p = (f.probFinal * 100).round();
    final noTrade = f.noTrade;

    final title = noTrade ? '지금은 지켜보기' : '진입 후보';
    final subtitle = noTrade ? (f.noTradeReason.isNotEmpty ? f.noTradeReason : '조건 부족') : '타점 ${p}%';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
        color: const Color(0xFF0A1224),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('현재 ${_tfLabel(tf)}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill(dir, bg: dirClr.withOpacity(0.18), fg: dirClr),
              const Spacer(),
              _pill('타점 $p%', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
            ],
          ),
          const SizedBox(height: 8),
          Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(subtitle, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7))),
          const SizedBox(height: 10),
          // 가격/손절/목표/레버리지 (있는 값만)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (f.entry > 0) _kv(theme, '진입', f.entry.toStringAsFixed(0)),
              if (f.sl > 0) _kv(theme, '손절', f.sl.toStringAsFixed(0), danger: true),
              if (f.tp1 > 0) _kv(theme, '1차', f.tp1.toStringAsFixed(0)),
              if (f.tp2 > 0) _kv(theme, '2차', f.tp2.toStringAsFixed(0)),
              if (f.tp3 > 0) _kv(theme, '3차', f.tp3.toStringAsFixed(0)),
              if (f.levNeed > 0) _kv(theme, '레버', '${f.levNeed.toStringAsFixed(1)}x'),
            ],
          ),
        ],
      ),
    );
  }

  // ============================
  // Step3: SUPER AGI 2줄 실시간 브리핑(하단 스트립)
  // - EV(+0.32R)
  // - 헌팅위험/추천SL
  // - 5% 리스크 기준 포지션/레버/예상수익(USDT)
  // ============================
  Widget _superAgiStrip(ThemeData theme, String tf, FuState? f) {
    if (f == null) {
      return _pill('매니저: 데이터 없음', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6));
    }

    final seed = AppSettings.accountUsdt;
    // AppSettings.riskPct는 % 값(예: 5.0)
    final riskPct = (AppSettings.riskPct / 100.0);

    // 반응구간이 없으면, 엔진 값만 간단히
    final hasZone = (f.reactHigh > f.reactLow) && f.reactLow > 0;
    final dir = f.dir; // 1=롱(위), -1=숏(아래), 0=관망
    final dirTxt = (dir == 1)
        ? '🟢 롱(위쪽)'
        : (dir == -1)
            ? '🔴 숏(아래쪽)'
            : '⚪ 관망';
    final dirCol = (dir == 1)
        ? const Color(0xFF33D18C)
        : (dir == -1)
            ? const Color(0xFFFF5B5B)
            : const Color(0xFFA8B4D6);

    // ATR 근사(최근 30봉 평균 range)
    double atrApprox = 0.0;
    if (f.candles.isNotEmpty) {
      final n = f.candles.length < 30 ? f.candles.length : 30;
      double sum = 0;
      for (int i = f.candles.length - n; i < f.candles.length; i++) {
        sum += (f.candles[i].high - f.candles[i].low).abs();
      }
      atrApprox = (n > 0) ? (sum / n) : 0.0;
    }

    // 추천 SL(헌팅밴드 바깥)
    StopHuntResult? sh;
    double suggestedSl = 0.0;
    double huntRisk = 0.0;
    if (hasZone) {
      // swingLow/high는 최근 N봉 기준(과도표시 방지)
      final c = f.candles;
      double? recentLow;
      double? recentHigh;
      if (c.isNotEmpty) {
        final recentN = c.length < 60 ? c.length : 60;
        recentLow = c[c.length - recentN].low;
        recentHigh = c[c.length - recentN].high;
        for (int i = c.length - recentN; i < c.length; i++) {
          if (c[i].low < recentLow!) recentLow = c[i].low;
          if (c[i].high > recentHigh!) recentHigh = c[i].high;
        }
      }
      sh = StopHuntCalculatorV6.compute(
        zoneLow: f.reactLow,
        zoneHigh: f.reactHigh,
        atr: atrApprox,
        k1: 1.0,
        k2: 0.20,
        swingLow: recentLow,
        swingHigh: recentHigh,
        entry: (f.entry > 0 ? f.entry : f.price),
      );
      huntRisk = sh.riskScore;
      if (dir == 1) {
        suggestedSl = sh.suggestedSlLong;
      } else if (dir == -1) {
        suggestedSl = sh.suggestedSlShort;
      } else {
        // 중립이면 가격 기준으로 가까운 쪽
        final dLong = ((f.entry > 0 ? f.entry : f.price) - sh.suggestedSlLong).abs();
        final dShort = (sh.suggestedSlShort - (f.entry > 0 ? f.entry : f.price)).abs();
        suggestedSl = (dLong <= dShort) ? sh.suggestedSlLong : sh.suggestedSlShort;
      }
    }

    // 포지션 사이징(5% 리스크)
    final entry = (f.entry > 0) ? f.entry : (f.price > 0 ? f.price : 0.0);
    final sl = (f.sl > 0) ? f.sl : (suggestedSl > 0 ? suggestedSl : 0.0);
    final ps = (entry > 0 && sl > 0)
        ? PositionSizerV6.compute(seed: seed, riskPct: riskPct, entry: entry, sl: sl)
        : PositionSizingResult(
            seed: seed,
            riskPct: riskPct,
            riskMoney: seed * riskPct,
            entry: entry,
            sl: sl,
            stopDist: 0,
            qty: 0,
            notional: 0,
            leverage: 0,
          );

    // EV (+0.32R)
    final rr = f.rr;
    final ev = EVCalculatorV6.compute(
      pWin: f.finalProb,
      rewardR: (rr > 0 ? rr : 1.0),
      riskR: 1.0,
    );

    // 25% 목표에 필요한 레버(반응구간/브레이크 폭 기준)
    double movePct = 0.0;
    if (hasZone && entry > 0) {
      movePct = ((f.reactHigh - f.reactLow).abs() / entry) * 100.0;
    }
    final levFor25 = (movePct > 0) ? (25.0 / movePct) : 0.0;

    // 예상 수익(USDT) — 엔진 목표(target)가 있으면 기준 계산
    double profit = 0.0;
    if (f.tp > 0 && entry > 0 && ps.qty > 0) {
      final raw = (f.tp - entry).abs() * ps.qty;
      profit = raw.isFinite ? raw : 0.0;
    }

    final gate = _agiGate(f: f, dir: dir, evR: ev.evR, huntRisk: huntRisk, leverage: ps.leverage);

    // === 한글 브리핑(근거 기반) ===
    final situation = _koSituation(f: f, dir: dir, hasZone: hasZone);
    final reason = _koReason(f: f, evR: ev.evR, huntRisk: huntRisk);
    final bullets = _evidenceBullets(f: f, evR: ev.evR, huntRisk: huntRisk);
    final actions = _nextActions(gateLevel: gate.level, dir: dir, hasZone: hasZone);

    final lineStats = hasZone
        ? '반응구간 ${f.reactLow.toStringAsFixed(0)}~${f.reactHigh.toStringAsFixed(0)} · 근거 ${f.evidenceHit}/${f.evidenceTotal} · 기대값 ${ev.evR >= 0 ? '+' : ''}${ev.evR.toStringAsFixed(2)}점'
        : '근거 ${f.evidenceHit}/${f.evidenceTotal} · 기대값 ${ev.evR >= 0 ? '+' : ''}${ev.evR.toStringAsFixed(2)}점 · 확률 ${(f.finalProb * 100).round()}%';

    final linePlan = '손절 ${sl > 0 ? sl.toStringAsFixed(0) : '--'} · 레버 ${ps.leverage > 0 ? ps.leverage.toStringAsFixed(1) : '--'}배 · 예상수익 ${profit > 0 ? '+${profit.toStringAsFixed(0)}' : '--'} · 25%목표레버 ${levFor25 > 0 ? levFor25.toStringAsFixed(1) : '--'}배';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
        color: const Color(0xFF0A1224),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('AI 매니저', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill('${_tfLabel(tf)}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const SizedBox(width: 8),
              _pill(dirTxt, bg: dirCol.withOpacity(0.16), fg: dirCol),
              const SizedBox(width: 8),
              _pill(gate.message, bg: gate.color.withOpacity(0.16), fg: gate.color),
              const SizedBox(width: 8),
              _pill('현재가 ${f.price > 0 ? f.price.toStringAsFixed(0) : '--'}', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
              const Spacer(),
              _pill('5% 리스크', bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)),
            ],
          ),
          const SizedBox(height: 8),
          Text('상황: $situation', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFE9ECFF), fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 4),
          Text('이유: $reason', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C2E2), fontWeight: FontWeight.w700, height: 1.15)),
          const SizedBox(height: 6),
          Text('근거', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFA8B4D6), fontWeight: FontWeight.w800, height: 1.15)),
          const SizedBox(height: 4),
          ...bullets.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text('• $e', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7), fontWeight: FontWeight.w600, height: 1.12)),
              )),
          const SizedBox(height: 6),
          Text(lineStats, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF97A6C7), fontWeight: FontWeight.w700, height: 1.15)),
          const SizedBox(height: 4),
          Text(linePlan, style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8), fontWeight: FontWeight.w600, height: 1.15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: actions
                .take(3)
                .map((t) => _pill(t, bg: const Color(0xFF151B2C), fg: const Color(0xFFA8B4D6)))
                .toList(),
          ),
        ],
      ),
    );
  }


  String _tfLabel(String tf) {
    // UI 표시용 라벨 (전부 한글)
    final k = tf.trim();
    switch (k) {
      case '1m':
        return '1분';
      case '3m':
        return '3분';
      case '5m':
        return '5분';
      case '15m':
        return '15분';
      case '1h':
        return '1시간';
      case '4h':
        return '4시간';
      case '1D':
      case '1d':
        return '하루';
      case '1W':
      case '1w':
        return '1주';
      case '1M':
        return '1달';
      default:
        return k;
    }
  }

Widget _seedBox(ThemeData theme) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F162B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2B3755).withOpacity(0.8)),
      ),
      child: Row(
        children: [
          Text('시드', style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFB7C2E2))),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _seedCtrl,
              keyboardType: TextInputType.number,
              style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              decoration: const InputDecoration(
                border: InputBorder.none,
                isDense: true,
                hintText: '예: 1000',
                hintStyle: TextStyle(color: Color(0xFF64719A)),
              ),
              onSubmitted: (_) => _applySeed(),
            ),
          ),
          const Text('USDT', style: TextStyle(color: Color(0xFF7F8DB8), fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _legend(ThemeData theme) {
    return Row(
      children: [
        _pill('진입', bg: const Color(0xFF13201A), fg: const Color(0xFF67F2B1)),
        const SizedBox(width: 6),
        _pill('손절', bg: const Color(0xFF241416), fg: const Color(0xFFFF7E7E)),
        const SizedBox(width: 6),
        _pill('익절', bg: const Color(0xFF161B2A), fg: const Color(0xFFA8B4D6)),
        const Spacer(),
        Text('표시는 엔진 계산값(5% 리스크) 그대로',
            style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8))),
      ],
    );
  }

  Widget _kv(ThemeData theme, String k, String v, {bool danger = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Text(k, style: theme.textTheme.bodySmall?.copyWith(color: theme.hintColor)),
          ),
          Expanded(child: Text(v, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, color: danger ? const Color(0xFFFF7E7E) : null))),
        ],
      ),
    );
  }

  String _dirKorean(FuState s) {
    if (s.noTrade) return '관망';
    // FuState.dir 는 int(+1/-1/0) 호환 게터라서 toUpperCase 불가.
    // 실제 방향 문자열은 signalDir 을 사용.
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('BUY') || d == 'UP') return '롱';
    if (d.contains('SHORT') || d.contains('SELL') || d == 'DN' || d == 'DOWN') return '숏';
    return '관망';
  }

  Color _dirColor(FuState s, ThemeData theme) {
    if (s.noTrade) return theme.hintColor;
    final d = s.signalDir.toUpperCase();
    if (d.contains('LONG') || d.contains('BUY') || d == 'UP') return const Color(0xFF29D3A6);
    if (d.contains('SHORT') || d.contains('SELL') || d == 'DN' || d == 'DOWN') return const Color(0xFFFF5B7A);
    return theme.hintColor;
  }

  Widget _tfRow(ThemeData theme, String tf, FuState? s) {
    if (s == null) {
      return _rowShell(
        tf: tf,
        left: Text('데이터 없음', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF64719A))),
        right: const SizedBox.shrink(),
      );
    }

    final prob = (s.finalProb * 100).clamp(0, 100).toStringAsFixed(0);
    final status = _statusLabel(s);
    final dir = _dirLabel(s);

    final entry = s.entry > 0 ? s.entry.toStringAsFixed(0) : '-';
    final stop = s.stop > 0 ? s.stop.toStringAsFixed(0) : '-';
    final target = s.target > 0 ? s.target.toStringAsFixed(0) : '-';
    final lev = s.leverage > 0 ? '${s.leverage.toStringAsFixed(1)}x' : '-';
    final qty = s.qty > 0 ? s.qty.toStringAsFixed(4) : '-';

    final react = (s.reactLow > 0 && s.reactHigh > 0) ? '${s.reactLow.toStringAsFixed(0)}~${s.reactHigh.toStringAsFixed(0)}' : '-';

    final badge = _badgeColor(s);

    return _rowShell(
      tf: tf,
      left: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _pill('$dir · $status', bg: badge.$1, fg: badge.$2),
              const SizedBox(width: 8),
              Text('확률 $prob%', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C2E2))),
              const Spacer(),
              Text('반응구간 $react', style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFF7F8DB8))),
            ],
          ),
          const SizedBox(height: 6),
          Text('진입 $entry · 손절 $stop · 익절 $target · 레버 $lev · 수량 $qty',
              style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFA8B4D6), fontWeight: FontWeight.w600)),
        ],
      ),
      right: const SizedBox.shrink(),
    );
  }

  (Color, Color) _badgeColor(FuState s) {
    // 확률/리스크 기준으로 "강/중/약" 느낌만.
    final p = s.finalProb;
    final r = s.risk;
    if (p >= 0.7 && r <= 0.35) return (const Color(0xFF13201A), const Color(0xFF67F2B1));
    if (p >= 0.55 && r <= 0.55) return (const Color(0xFF1B2032), const Color(0xFFA8B4D6));
    return (const Color(0xFF241416), const Color(0xFFFF7E7E));
  }

  String _statusLabel(FuState s) {
    if (s.tradeLock) return '잠금';
    if (s.tradeOk) return '진입';
    if (s.watch) return '관망';
    return '대기';
  }

  String _dirLabel(FuState s) {
    // 0: 중립, 1: 롱, -1: 숏
    if (s.dir > 0) return '롱';
    if (s.dir < 0) return '숏';
    return '중립';
  }

  Widget _rowShell({required String tf, required Widget left, required Widget right}) {
    final isCurrent = tf == widget.currentTf;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isCurrent ? const Color(0xFF121C36) : const Color(0xFF0F162B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: (isCurrent ? const Color(0xFF67F2B1) : const Color(0xFF2B3755)).withOpacity(0.65),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Text(tf,
                textAlign: TextAlign.left,
                style: const TextStyle(color: Color(0xFFB7C2E2), fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 6),
          Expanded(child: left),
          right,
        ],
      ),
    );
  }

  Widget _pill(String text, {required Color bg, required Color fg}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withOpacity(0.25)),
      ),
      child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}
