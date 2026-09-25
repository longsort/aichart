import 'package:flutter/material.dart';

class AiActionCard extends StatelessWidget {
  final List<String> triggers;
  final bool expanded;
  final VoidCallback onToggle;

  const AiActionCard({
    super.key,
    required this.triggers,
    required this.expanded,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F151D),
        border: Border.all(color: const Color(0xFF273448)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '자동 트리거',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              InkWell(
                onTap: onToggle,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text(
                    expanded ? '닫기' : '보기',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: const Color(0xFF9DB7FF),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (!expanded)
            Text(
              triggers.isNotEmpty ? triggers.first : '트리거 없음',
              style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C0D1)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            )
          else
            ...triggers.map(
              (t) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  '• $t',
                  style: theme.textTheme.bodySmall?.copyWith(color: const Color(0xFFB7C0D1)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
