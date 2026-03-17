import 'package:flutter/material.dart';

/// 초보용 방향 표시(롱/숏 금지)
/// - 오르는 쪽 진입 / 내리는 쪽 진입 / 지금은 쉬기
class DirectionBadge extends StatelessWidget {
  final String decisionTitle; // UltraEngine의 Decision.title
  final bool locked;

  const DirectionBadge({
    super.key,
    required this.decisionTitle,
    required this.locked,
  });

  ({String label, IconData icon, Color color}) _map() {
    if (locked || decisionTitle.contains('쉬기') || decisionTitle.contains('하지')) {
      return (label: '지금은 쉬기', icon: Icons.pause_circle_filled, color: const Color(0xFFB0B7C3));
    }
    if (decisionTitle.contains('오르는')) {
      return (label: '오르는 쪽 진입', icon: Icons.trending_up, color: const Color(0xFF7CFFB2));
    }
    if (decisionTitle.contains('내리는')) {
      return (label: '내리는 쪽 진입', icon: Icons.trending_down, color: const Color(0xFFFF5C7A));
    }
    // fallback
    return (label: '관망', icon: Icons.visibility, color: const Color(0xFFFFC04D));
  }

  @override
  Widget build(BuildContext context) {
    final m = _map();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.28),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: m.color.withOpacity(0.55)),
        boxShadow: [
          BoxShadow(color: m.color.withOpacity(0.18), blurRadius: 14),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(m.icon, color: m.color, size: 18),
          const SizedBox(width: 8),
          Text(
            m.label,
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}
