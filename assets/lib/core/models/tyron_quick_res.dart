import 'package:flutter/material.dart';

/// TYRON 퀵 시그널 결과 (LONG/SHORT/WAIT + % + 색상).
/// 메인 화면·미래경로 차트에서 공통 표시용.
class TyronQuickRes {
  final String dir;
  final int pct;
  final Color color;
  const TyronQuickRes(this.dir, this.pct, this.color);
}
