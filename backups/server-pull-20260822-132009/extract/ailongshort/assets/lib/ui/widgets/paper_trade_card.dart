import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_account.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_trade_engine.dart';

class PaperTradeCard extends StatelessWidget {
  const PaperTradeCard({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: PaperTradeEngine.I.state,
      builder: (_, s, __) {
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('가상 매매', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  _help(context),
                  const Spacer(),
                  Switch(
                    value: s.enabled,
                    onChanged: (v) => PaperTradeEngine.I.toggle(v),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ValueListenableBuilder<double>(
                valueListenable: PaperAccount.I.balance,
                builder: (_, b, __) {
                  return Text('가상 잔고: ${b.toStringAsFixed(2)} USDT',
                      style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold));
                },
              ),
              const SizedBox(height: 6),
              ValueListenableBuilder<double>(
                valueListenable: PaperTradeEngine.I.perf01,
                builder: (_, p, __) {
                  return ValueListenableBuilder<double>(
                    valueListenable: PaperTradeEngine.I.autoEntryThreshold,
                    builder: (_, thr, __) {
                      return Text('최근 성과: ${(p * 100).toStringAsFixed(0)}%  •  자동진입 기준: ${(thr * 100).toStringAsFixed(0)}% 이상',
                          style: const TextStyle(color: Colors.white54, fontSize: 11));
                    },
                  );
                },
              ),
              const SizedBox(height: 4),
              Text('최대 손실: 잔고의 5% (자동 손절 기준)',
                  style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 11)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _seedDialog(context),
                      child: const Text('시드 입력'),
                    ),
                  ),
                ],
              ),
              if (s.pos != null) ...[
                const SizedBox(height: 10),
                _posBox(s),
              ],
              if (s.last.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text('최근 결과: ${s.last.first.outcome} (손익 ${s.last.first.pnlUsd.toStringAsFixed(2)} USDT)',
                    style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _help(BuildContext context) {
    return InkWell(
      onTap: () {
        showDialog(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('가상 매매란?'),
            content: const Text(
              '앱이 낸 신호로 “가상으로” 매수/매도를 합니다.\n'
              '실제 돈은 움직이지 않습니다.\n\n'
              '목적:\n'
              '- 앱이 잘못된 신호를 내면 기록되고\n'
              '- 결과로 AI가 자동으로 보정(학습)합니다.\n\n'
              '주의:\n'
              '- 안전 모드라서 “안전도”가 높을 때만 자동 진입합니다.',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('닫기')),
            ],
          ),
        );
      },
      child: const Icon(Icons.help_outline, color: Colors.white54, size: 18),
    );
  }

  Widget _posBox(PaperState s) {
    final p = s.pos!;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('진행중: ${p.dir}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('진입 ${p.entry.toStringAsFixed(2)} / 손절 ${p.sl.toStringAsFixed(2)} / 목표 ${p.tps.isNotEmpty ? p.tps[0].toStringAsFixed(2) : '-'}',
              style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 4),
          Text('추천 레버리지: x${p.leverage.toStringAsFixed(1)} (안전)  •  포지션 규모: ${p.sizeUsd.toStringAsFixed(0)} USDT',
              style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  Future<void> _seedDialog(BuildContext context) async {
    final c = TextEditingController(text: PaperAccount.I.seed.value.toStringAsFixed(0));
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('시드(USDT) 입력'),
        content: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '예: 1000'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('취소')),
          ElevatedButton(
            onPressed: () {
              final v = double.tryParse(c.text.trim()) ?? 1000.0;
              PaperAccount.I.setSeed(v);
              Navigator.pop(context);
            },
            child: const Text('적용'),
          ),
        ],
      ),
    );
  }
}