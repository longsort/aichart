import 'package:flutter/material.dart';

import '../data/indicator_glossary.dart';
import '../widgets/indicator_info_sheet.dart';
import '../widgets/neon_theme.dart';

class IndicatorGlossaryScreen extends StatefulWidget {
  const IndicatorGlossaryScreen({super.key});

  @override
  State<IndicatorGlossaryScreen> createState() => _IndicatorGlossaryScreenState();
}

class _IndicatorGlossaryScreenState extends State<IndicatorGlossaryScreen> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final query = _q.text.trim().toLowerCase();

    final items = kIndicatorGlossary.where((d) {
      if (query.isEmpty) return true;
      return d.title.toLowerCase().contains(query) || d.oneLine.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: t.bg,
      appBar: AppBar(
        backgroundColor: t.bg,
        foregroundColor: t.fg,
        title: const Text('지???�전'),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        child: Column(
          children: [
            TextField(
              controller: _q,
              onChanged: (_) => setState(() {}),
              style: TextStyle(color: t.fg, fontWeight: FontWeight.w800),
              decoration: InputDecoration(
                hintText: '검?? ?�정, 반응, PO3??,
                hintStyle: TextStyle(color: t.muted),
                filled: true,
                fillColor: t.card,
                prefixIcon: Icon(Icons.search_rounded, color: t.muted),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: t.border.withOpacity(0.45))),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: t.border.withOpacity(0.45))),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: t.accent.withOpacity(0.65))),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView.separated(
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final d = items[i];
                  return InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => IndicatorInfoSheet.open(context, id: d.id),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: t.card,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: t.border.withOpacity(0.45)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d.title, style: TextStyle(color: t.fg, fontWeight: FontWeight.w900, fontSize: 14)),
                          const SizedBox(height: 6),
                          Text(d.oneLine, style: TextStyle(color: t.muted, fontWeight: FontWeight.w700, fontSize: 12)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
