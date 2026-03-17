import 'package:flutter/material.dart';
import '../../core/models/future_path_price_dto.dart';

class FuturePathPriceLegend extends StatelessWidget {
  final FuturePathPriceDTO fp;
  const FuturePathPriceLegend({super.key, required this.fp});

  String _fmt(double v) => v.toStringAsFixed(0);

  @override
  Widget build(BuildContext context) {
    final isLong = fp.dir == 'LONG';
    final c = isLong ? const Color(0xFF1EEA6A) : const Color(0xFFEA2A2A);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: c.withOpacity(0.15),
                  border: Border.all(color: c.withOpacity(0.4)),
                ),
                child: Text('${fp.tf} ${fp.dir} ${fp.pMain}%',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: c)),
              ),
              const SizedBox(width: 8),
              Text('RR ${(fp.rrX10/10).toStringAsFixed(1)}',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          Text('시작 ${_fmt(fp.anchor)}', style: const TextStyle(fontSize: 11)),
          Text('목표 ${_fmt(fp.target)}', style: const TextStyle(fontSize: 11)),
          Text('무효 ${_fmt(fp.invalid)}', style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }
}
