import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';
import '../engine_evidence.dart';

class ModPNF extends StatefulWidget {
  const ModPNF({super.key});
  @override
  State<ModPNF> createState() => _ModPNFState();
}

class _ModPNFState extends State<ModPNF> {
  final engine = EvidenceEngine();
  final rnd = Random();

  int tab = 1;
  final List<double> ev = List.filled(6, 0.2);
  final List<double> past = [];
  EngineResult? now;
  double futureUp = 0.0;

  void run() {
    final i = rnd.nextInt(6);
    ev[i] = (ev[i] + 0.18 + rnd.nextDouble() * 0.12).clamp(0.0, 1.0);
    final r = engine.run(ev);
    now = r;
    past.add(r.confidence);
    if (past.length > 20) past.removeAt(0);
    futureUp = (r.confidence * 0.65 + rnd.nextDouble() * 0.35).clamp(0.0, 1.0);
    setState(() {});
  }

  @override
  void initState() {
    super.initState();
    run();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("Past / Now / Future"), foregroundColor: Colors.white),
      body: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(child: _nav("과거", 0)),
                Expanded(child: _nav("?�재", 1)),
                Expanded(child: _nav("미래", 2)),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: IndexedStack(
                index: tab,
                children: [
                  _card("과거 ?�계", Text(past.map((e)=>"${(e*100).round()}").join(" · "),
                      style: TextStyle(color: Colors.white.withOpacity(0.6), fontWeight: FontWeight.w800, fontSize: 12))),
                  _nowCard(),
                  _card("미래 ?�나리오", Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("?�승 ?�률 ${(futureUp*100).round()}%",
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                      const SizedBox(height: 8),
                      Text(futureUp>=0.78 ? "?�승 ?�세" : futureUp<=0.35 ? "?�험 구간" : "중립/관�?,
                          style: TextStyle(color: Colors.white.withOpacity(0.7), fontWeight: FontWeight.w800)),
                    ],
                  )),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(onPressed: run, child: const Text("AI RUN")),
            )
          ],
        ),
      ),
    );
  }

  Widget _nowCard() {
    final r = now;
    final conf = r?.confidence ?? 0;
    final c = heat(conf);
    return Center(
      child: Container(
        width: 300,
        height: 300,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: c.withOpacity(0.25), blurRadius: 120, spreadRadius: 28)],
          border: Border.all(color: Colors.white.withOpacity(0.10), width: 2),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text("${(conf*100).round()}%",
                  style: const TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              Text(r == null ? "" : r.labelKo(), style: TextStyle(color: c, fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text("증거 ${r?.evidence ?? 0}/6", style: TextStyle(color: Colors.white.withOpacity(0.55), fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _nav(String t, int i) {
    final on = tab == i;
    return GestureDetector(
      onTap: () => setState(() => tab = i),
      child: Container(
        height: 44,
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          color: on ? const Color(0xFF111622) : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Center(
          child: Text(t, style: TextStyle(color: on ? Colors.white : Colors.white70, fontWeight: FontWeight.w900, fontSize: 12)),
        ),
      ),
    );
  }

  Widget _card(String title, Widget child) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: tTitle()),
        const SizedBox(height: 12),
        child,
      ]),
    );
  }
}
