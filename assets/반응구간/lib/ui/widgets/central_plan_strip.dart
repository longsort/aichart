import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/consensus/consensus_bus.dart';

/// Main-top compact strip: Entry / SL / TP + NO-TRADE lock reason.
///
/// Reads from [ConsensusBus] which is updated by CentralConsensusEngine.
class CentralPlanStrip extends StatelessWidget {
  const CentralPlanStrip({super.key});

  @override
  Widget build(BuildContext context) {
    final b = ConsensusBus.I;
    return ValueListenableBuilder<bool>(
      valueListenable: b.noTradeLock,
      builder: (context, locked, _) {
        return ValueListenableBuilder<double>(
          valueListenable: b.planEntry,
          builder: (context, entry, __) {
            return ValueListenableBuilder<double>(
              valueListenable: b.planSL,
              builder: (context, sl, ___) {
                return ValueListenableBuilder<List<double>>(
                  valueListenable: b.planTPs,
                  builder: (context, tps, ____) {
                    final has = entry > 0 && sl > 0 && tps.isNotEmpty;
                    return Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF101623),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(locked ? Icons.lock : Icons.track_changes,
                                  size: 16, color: locked ? Colors.white54 : Colors.white),
                              const SizedBox(width: 8),
                              Text(
                                locked ? '매매금지 잠금' : '진입 / 손절 / 목표',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                              const Spacer(),
                              if (locked)
                                ValueListenableBuilder<String>(
                                  valueListenable: b.noTradeReason,
                                  builder: (context, r, _) => Text(
                                    r.isEmpty ? '대기' : r,
                                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          if (!has)
                            const Text('계산중…', style: TextStyle(color: Colors.white70, fontSize: 11))
                          else
                            Wrap(
                              spacing: 10,
                              runSpacing: 6,
                              children: [
                                _chip('Entry', entry),
                                _chip('SL', sl),
                                _chip('TP1', tps[0]),
                                if (tps.length > 1) _chip('TP2', tps[1]),
                                if (tps.length > 2) _chip('TP3', tps[2]),
                              ],
                            ),
                          const SizedBox(height: 6),
                          ValueListenableBuilder<double>(
                            valueListenable: b.planRR,
                            builder: (context, rr, _) {
                              return Text(
                                'RR ~ ${rr.toStringAsFixed(2)}   •   ATR ${b.atr.value.toStringAsFixed(2)}',
                                style: const TextStyle(color: Colors.white54, fontSize: 10),
                              );
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  static Widget _chip(String k, double v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(k, style: const TextStyle(color: Colors.white70, fontSize: 10)),
          const SizedBox(width: 6),
          Text(v.toStringAsFixed(2), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
