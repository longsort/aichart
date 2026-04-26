import 'package:flutter/material.dart';
import 'package:ailongshort/engine/paper/paper_account.dart';
import 'package:ailongshort/engine/paper/paper_trade_engine.dart';

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
                  const Text('Í∞Ä??Îß§Îß§', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
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
                  return Text('Í∞Ä???îÍ≥†: ${b.toStringAsFixed(2)} USDT',
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
                      return Text('ÏµúÍ∑º ?±Í≥º: ${(p * 100).toStringAsFixed(0)}%  ?? ?êÎèôÏßÑÏûÖ Í∏∞Ï?: ${(thr * 100).toStringAsFixed(0)}% ?¥ÏÉÅ',
                          style: const TextStyle(color: Colors.white54, fontSize: 11));
                    },
                  );
                },
              ),
              const SizedBox(height: 4),
              Text('ÏµúÎ? ?êÏã§: ?îÍ≥†??5% (?êÎèô ?êÏ†à Í∏∞Ï?)',
                  style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 11)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _seedDialog(context),
                      child: const Text('?úÎìú ?ÖÎ†•'),
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
                Text('ÏµúÍ∑º Í≤∞Í≥º: ${s.last.first.outcome} (?êÏùµ ${s.last.first.pnlUsd.toStringAsFixed(2)} USDT)',
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
            title: const Text('Í∞Ä??Îß§Îß§?Ä?'),
            content: const Text(
              '?±Ïù¥ ???†Ìò∏Î°??úÍ??ÅÏúºÎ°ú‚Ä?Îß§Ïàò/Îß§ÎèÑÎ•??©Îãà??\n'
              '?§Ï†ú ?àÏ? ?ÄÏßÅÏù¥ÏßÄ ?äÏäµ?àÎã§.\n\n'
              'Î™©Ï†Å:\n'
              '- ?±Ïù¥ ?òÎ™ª???†Ìò∏Î•??¥Î©¥ Í∏∞Î°ù?òÍ≥†\n'
              '- Í≤∞Í≥ºÎ°?AIÍ∞Ä ?êÎèô?ºÎ°ú Î≥¥Ï†ï(?ôÏäµ)?©Îãà??\n\n'
              'Ï£ºÏùò:\n'
              '- ?àÏ†Ñ Î™®Îìú?ºÏÑú ?úÏïà?ÑÎèÑ?ùÍ? ?íÏùÑ ?åÎßå ?êÎèô ÏßÑÏûÖ?©Îãà??',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('?´Í∏∞')),
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
          Text('ÏßÑÌñâÏ§? ${p.dir}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('ÏßÑÏûÖ ${p.entry.toStringAsFixed(2)} / ?êÏ†à ${p.sl.toStringAsFixed(2)} / Î™©Ìëú ${p.tps.isNotEmpty ? p.tps[0].toStringAsFixed(2) : '-'}',
              style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 4),
          Text('Ï∂îÏ≤ú ?àÎ≤ÑÎ¶¨Ï?: x${p.leverage.toStringAsFixed(1)} (?àÏ†Ñ)  ?? ?¨Ï???Í∑úÎ™®: ${p.sizeUsd.toStringAsFixed(0)} USDT',
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
        title: const Text('?úÎìú(USDT) ?ÖÎ†•'),
        content: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '?? 1000'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Ï∑®ÏÜå')),
          ElevatedButton(
            onPressed: () {
              final v = double.tryParse(c.text.trim()) ?? 1000.0;
              PaperAccount.I.setSeed(v);
              Navigator.pop(context);
            },
            child: const Text('?ÅÏö©'),
          ),
        ],
      ),
    );
  }
}