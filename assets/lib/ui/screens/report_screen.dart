
import 'package:flutter/material.dart';
import '../../ui/widgets/neon_theme.dart';

class ReportScreen extends StatelessWidget {
  final String title;
  final String content;

  const ReportScreen({
    super.key,
    required this.title,
    required this.content,
  });

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    return Scaffold(
      backgroundColor: theme.bg,
      appBar: AppBar(
        backgroundColor: theme.bg,
        elevation: 0,
        title: Text(title, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            tooltip: '복사',
            onPressed: () async {
              // Clipboard는 flutter/services 필요. 간단히 Snack만 (의존성 최소)
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('리포트를 선택해서 복사하세요(PC: 드래그 후 Ctrl+C)')),
              );
            },
            icon: Icon(Icons.copy, color: theme.fg),
          ),
        ],
      ),
      body: SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 10, 12, 16),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: theme.border),
          ),
          child: SingleChildScrollView(
            child: SelectableText(
              content,
              style: TextStyle(color: theme.fg, height: 1.25),
            ),
          ),
        ),
      ),
    );
  }
}
