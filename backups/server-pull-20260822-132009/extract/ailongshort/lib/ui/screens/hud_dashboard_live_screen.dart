import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/services/bitget_ticker_service.dart';

/// HUD-style Dashboard (UI-first)
///
/// Î™©Ìëú: ?¨Ïö©?êÍ? Ï§Ä ?àÌçº?∞Ïä§Ï≤òÎüº
/// - ?§Ïò® ?åÎëêÎ¶?+ Í∏Ä?òÏä§ Ïπ¥Îìú
/// - Ï¢åÏ∏° Î©îÎâ¥
/// - Ï§ëÏïô Í≤åÏù¥ÏßÄ + Í∞ÄÍ≤?/// - ?ïÎ•†/?ïÎ†•/?îÏïΩ ?®ÎÑê
///
/// ?†Ô∏è ?ÑÏû¨??"?îÎ©¥"??Î®ºÏ?. ?∞Ïù¥???îÏßÑ ?∞Í≤∞?Ä ?§Ïùå ?®Í≥Ñ?êÏÑú Î∂ôÏù¥Î©???
class HudDashboardLiveScreen extends StatefulWidget {
  const HudDashboardLiveScreen({super.key});

  @override
  State<HudDashboardLiveScreen> createState() => _HudDashboardLiveScreenState();
}

class _HudDashboardLiveScreenState extends State<HudDashboardLiveScreen> {
  int _leftMenuIndex = 1; // 0 Í¥Ä?? 1 ?Ä?úÎ≥¥?? 2 ?†Ìò∏, 3 Í∏∞Î°ù?µÍ≥Ñ

  // --- LIVE: Í∞ÄÍ≤©Î???Î∂ôÏûÑ (1?®Í≥Ñ) ---
  final BitgetTickerService _ticker = BitgetTickerService(
    symbol: 'BTCUSDT_UMCBL',
  );

  Timer? _timer;
  double _price = 0;
  double _prevPrice = 0;
  double _score01 = 0.5;
  double _scoreAnim01 = 0.5;
  int _lastTickMs = 0;
  String _netState = 'CONNECT'; // 0..1 (0=?? 1=Î°?

  // --- ?ÑÏßÅ?Ä Mock: ?§Ïùå ?®Í≥Ñ?êÏÑú ?îÏßÑ Í∞íÏúºÎ°?ÍµêÏ≤¥ ---
  double _probUp = 0.50;
  double _probDown = 0.50;
  double _buyPressure = 0.50;
  double _sellPressure = 0.50;
  int _longCount = 0;
  int _shortCount = 0;
  int _logTotal = 0;

  @override
  void initState() {
    super.initState();

    // ???§Ìñâ ÏßÅÌõÑ 1Î≤? ?¥ÌõÑ 2Ï¥àÎßà???¥ÎßÅ
    _pullOnce();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _pullOnce());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _pullOnce() async {
    final p = await _ticker.fetchLastPrice();
    if (!mounted) return;
    if (p == null) {
      if (!mounted) return;
      setState(() {
        _netState = 'OFFLINE';
      });
      return; // ?§Ìä∏?åÌÅ¨/?ëÎãµ ?§Ìå®Î©??†Ï?
    }

    setState(() {
      _prevPrice = _price == 0 ? p : _price;
      _price = p;

      // Í∞ÄÍ≤?Î≥Ä?îÎ°ú Í≤åÏù¥ÏßÄÎ•?"?ºÎã®" ?ÄÏßÅÏù¥Í≤???(?îÏßÑ Î∂ôÏù¥Í∏????®Í≥Ñ)
      // ?ÅÏäπ=Î°±Ï™Ω, ?òÎùΩ=?èÏ™Ω
      final diff = (_price - _prevPrice);
      final base = (_prevPrice == 0) ? 0 : (_prevPrice);
      final pct = base == 0 ? 0 : (diff / base);

      // ÎØºÍ∞ê??Ï°∞Ï†à): 0.15% ?ÄÏßÅÏù¥Î©?Í≤åÏù¥ÏßÄÍ∞Ä ?àÏóê ?ÑÍ≤å ?ÄÏßÅÏù¥?ÑÎ°ù
      final k = 1 / 0.0015;
      final raw = 0.5 + (pct * k);
      _score01 = raw.clamp(0.0, 1.0);

      // ?ÑÎûò 4Í∞úÎäî ?§Ïùå ?®Í≥Ñ?êÏÑú ?îÏßÑ Í∞??∞Í≤∞
      _probUp = (0.48 + (_score01 - 0.5) * 0.35).clamp(0.0, 1.0);
      _probDown = (1 - _probUp).clamp(0.0, 1.0);
      _buyPressure = (0.50 + (_score01 - 0.5) * 0.40).clamp(0.0, 1.0);
      _sellPressure = (1 - _buyPressure).clamp(0.0, 1.0);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF071017),
      body: Stack(
        children: [
          const _HudBackground(),
          SafeArea(
            child: Column(
              children: [
                _TopBar(
                  titleLeft: 'Fulink  Pro Ultra',
                  titleRight: '?Ä?úÎ≥¥?? ?? ' + _netState + (_lastTickMs==0 ? '' : '  ' + _agoText()),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _LeftMenu(
                          selectedIndex: _leftMenuIndex,
                          onSelect: (i) => setState(() => _leftMenuIndex = i),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                flex: 30,
                                child: _PanelGlass(
                                  title: '?ïÎ•† / ?ïÎ†•',
                                  child: _ProbPressurePanel(
                                    probUp: _probUp,
                                    probDown: _probDown,
                                    buyPressure: _buyPressure,
                                    sellPressure: _sellPressure,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                flex: 40,
                                child: _PanelGlass(
                                  title: '',
                                  child: _CenterGaugePanel(
                                    price: _price,
                                    // STEP1: Í∞ÄÍ≤?Î≥Ä?îÎ°ú ?ÑÏãú ?§ÏΩî?¥Î? ÎßåÎì§Í≥?Í≤åÏù¥ÏßÄÎ•??ÄÏßÅÏù∏??
                                    // (?îÏßÑ ?∞Í≤∞?Ä ?§Ïùå ?®Í≥Ñ)
                                    score: (_scoreAnim01 - 0.5) * 2, // -1..1
                                    zoneText: 'BULL Ï°?/ Í∞ïÌïú Îß§Ïàò ??,
                                    noteText: 'Í¥ÄÍ∞Ä: Í∏∞Ìï¥??Í∏àÎ°± / Î°ùÎèô Îß§Î†®',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                flex: 30,
                                child: _PanelGlass(
                                  title: 'ÏßÑÏûÖ Î°úÍ∑∏ ?îÏïΩ',
                                  topRightText: 'Ï¥?$_logTotalÍ∞?,
                                  child: _RightSummaryPanel(
                                    longCount: _longCount,
                                    shortCount: _shortCount,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const _BottomTabs(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------- Background -------------------------

class _HudBackground extends StatelessWidget {
  const _HudBackground();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _HudGridPainter(),
      child: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.2, -0.3),
            radius: 1.25,
            colors: [
              Color(0xFF0F2B3B),
              Color(0xFF071017),
              Color(0xFF04090E),
            ],
          ),
        ),
        child: Container(
          decoration: BoxDecoration(
            // ?ΩÌïú ?∏Ïù¥Ï¶??êÎÇå
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withOpacity(0.03),
                Colors.transparent,
                Colors.white.withOpacity(0.02),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HudGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = const Color(0xFF55CCFF).withOpacity(0.06)
      ..strokeWidth = 1;

    const step = 48.0;
    for (double x = 0; x <= size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
    }
    for (double y = 0; y <= size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }

    // ?ÄÍ∞ÅÏÑ† ?ºÏù∏ Î™?Í∞?    final p2 = Paint()
      ..color = const Color(0xFF8AE6FF).withOpacity(0.05)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, size.height * 0.15), Offset(size.width, size.height * 0.65), p2);
    canvas.drawLine(Offset(size.width * 0.15, 0), Offset(size.width * 0.85, size.height), p2);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ------------------------- Top / Bottom -------------------------

class _TopBar extends StatelessWidget {
  final String titleLeft;
  final String titleRight;

  const _TopBar({
    required this.titleLeft,
    required this.titleRight,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      child: _GlowBorder(
        radius: 10,
        child: Row(
          children: [
            const Icon(Icons.menu, color: Colors.white70),
            const SizedBox(width: 10),
            Text(
              titleLeft,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              titleRight,
              style: TextStyle(
                color: Colors.white.withOpacity(0.9),
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            Row(
              children: [
                const Icon(Icons.wifi, color: Colors.white70, size: 18),
                const SizedBox(width: 10),
                Text('100', style: TextStyle(color: Colors.white.withOpacity(0.85))),
                const SizedBox(width: 6),
                const Icon(Icons.battery_full, color: Colors.white70, size: 18),
                const SizedBox(width: 14),
                Text('5:55', style: TextStyle(color: Colors.white.withOpacity(0.85))),
                const SizedBox(width: 14),
                const Icon(Icons.close, color: Colors.white70, size: 18),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomTabs extends StatelessWidget {
  const _BottomTabs();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
      child: _GlowBorder(
        radius: 10,
        child: Row(
          children: const [
            _BottomTab(icon: Icons.track_changes, label: 'Í¥Ä??),
            _BottomTab(icon: Icons.grid_view_rounded, label: '?Ä?úÎ≥¥??, active: true),
            _BottomTab(icon: Icons.bolt, label: '?†Ìò∏'),
            _BottomTab(icon: Icons.bar_chart_rounded, label: 'Í∏∞Î°ù?µÍ≥Ñ'),
          ],
        ),
      ),
    );
  }
}

class _BottomTab extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;

  const _BottomTab({
    required this.icon,
    required this.label,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = active ? const Color(0xFF63D7FF) : Colors.white70;
    return Expanded(
      child: InkWell(
        onTap: () {},
        child: Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: c),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(color: c, fontWeight: active ? FontWeight.w700 : FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------- Left menu -------------------------

class _LeftMenu extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  const _LeftMenu({
    required this.selectedIndex,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: _GlowBorder(
        radius: 14,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            children: [
              _MenuButton(
                icon: Icons.settings,
                label: 'Í¥Ä??,
                active: selectedIndex == 0,
                onTap: () => onSelect(0),
              ),
              const SizedBox(height: 10),
              _MenuButton(
                icon: Icons.grid_view_rounded,
                label: '?Ä?úÎ≥¥??,
                active: selectedIndex == 1,
                onTap: () => onSelect(1),
              ),
              const SizedBox(height: 10),
              _MenuButton(
                icon: Icons.bar_chart_rounded,
                label: '?†Ìò∏',
                active: selectedIndex == 2,
                onTap: () => onSelect(2),
              ),
              const SizedBox(height: 10),
              _MenuButton(
                icon: Icons.receipt_long,
                label: 'Í∏∞Î°ù?µÍ≥Ñ',
                active: selectedIndex == 3,
                onTap: () => onSelect(3),
              ),
              const Spacer(),
              _MenuButton(
                icon: Icons.tune,
                label: '?§Ï†ï',
                active: false,
                onTap: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MenuButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _MenuButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bg = active ? const Color(0xFF0C2A3B).withOpacity(0.75) : Colors.white.withOpacity(0.06);
    final border = active ? const Color(0xFF7CE9FF).withOpacity(0.8) : Colors.white.withOpacity(0.10);
    final text = active ? Colors.white : Colors.white70;
    return InkWell(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border, width: 1),
          boxShadow: active
              ? [
                  BoxShadow(
                    color: const Color(0xFF67D9FF).withOpacity(0.18),
                    blurRadius: 16,
                    spreadRadius: 1,
                  ),
                ]
              : [],
        ),
        child: Row(
          children: [
            Icon(icon, color: text, size: 20),
            const SizedBox(width: 12),
            Text(label, style: TextStyle(color: text, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

// ------------------------- Panels -------------------------

class _PanelGlass extends StatelessWidget {
  final String title;
  final String? topRightText;
  final Widget child;

  const _PanelGlass({
    required this.title,
    required this.child,
    this.topRightText,
  });

  @override
  Widget build(BuildContext context) {
    return _GlowBorder(
      radius: 16,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title.isNotEmpty)
              Row(
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.92),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Spacer(),
                  if (topRightText != null)
                    Text(
                      topRightText!,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.8),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                ],
              ),
            if (title.isNotEmpty) const SizedBox(height: 10),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}

class _ProbPressurePanel extends StatelessWidget {
  final double probUp;
  final double probDown;
  final double buyPressure;
  final double sellPressure;

  const _ProbPressurePanel({
    required this.probUp,
    required this.probDown,
    required this.buyPressure,
    required this.sellPressure,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _MetricRow(
          label: '?ÅÏäπ ?ïÎ•†',
          value: '${(probUp * 100).round()}%',
          accent: const Color(0xFF3CFF7F),
        ),
        const SizedBox(height: 10),
        _MetricRow(
          label: '?òÎùΩ ?ïÎ•†',
          value: '${(probDown * 100).round()}%',
          accent: const Color(0xFFFF4B4B),
        ),
        const SizedBox(height: 10),
        _MetricRow(
          label: 'Îß§Ïàò ?ïÎ†•',
          value: '${(buyPressure * 100).round()}%',
          accent: const Color(0xFF4BD6FF),
        ),
        const SizedBox(height: 10),
        _MetricRow(
          label: 'Îß§ÎèÑ ?ïÎ†•',
          value: '${(sellPressure * 100).round()}%',
          accent: const Color(0xFFFFB64B),
        ),
      ],
    );
  }
}

class _MetricRow extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;

  const _MetricRow({
    required this.label,
    required this.value,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withOpacity(0.18), width: 1),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(color: Colors.white.withOpacity(0.85), fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                SizedBox(
                  height: 28,
                  child: CustomPaint(
                    painter: _SparklinePainter(seed: label.hashCode, color: accent.withOpacity(0.95)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            value,
            style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 22),
          ),
        ],
      ),
    );
  }
}

class _CenterGaugePanel extends StatelessWidget {
  final double price;
  final double score; // -1 ~ +1
  final String zoneText;
  final String noteText;

  const _CenterGaugePanel({
    required this.price,
    required this.score,
    required this.zoneText,
    required this.noteText,
  });

  @override
  Widget build(BuildContext context) {
    final clamped = score.clamp(-1.0, 1.0);
    final isLong = clamped >= 0;

    return Column(
      children: [
        // Í∞ÄÍ≤?        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isLong ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                color: (isLong ? Colors.greenAccent : Colors.redAccent).withOpacity(0.9),
                size: 22,
              ),
              Text(
                price <= 0 ? '--' : price.toStringAsFixed(1),
                style: const TextStyle(
                  color: Color(0xFFFFD27A),
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: 1.6,
              child: CustomPaint(
                painter: _GaugePainter(value: (clamped + 1) / 2),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          isLong ? 'Î°??†Ìò∏ (BUY)' : '???†Ìò∏ (SELL)',
          style: TextStyle(
            color: Colors.white.withOpacity(0.95),
            fontSize: 26,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          zoneText,
          style: TextStyle(color: Colors.white.withOpacity(0.85), fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          noteText,
          style: TextStyle(color: Colors.white.withOpacity(0.65), fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),
        _HudButton(label: 'ÏßÑÏûÖ Í∑ºÍ±∞', onTap: () {}),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _RightSummaryPanel extends StatelessWidget {
  final int longCount;
  final int shortCount;

  const _RightSummaryPanel({
    required this.longCount,
    required this.shortCount,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _SummaryRow(
          label: 'Î°??†Ìò∏',
          value: '$longCount Í∞?,
          zoneLabel: 'BULL Ï°?,
          zoneColor: const Color(0xFF3CFF7F),
          seed: 11,
        ),
        const SizedBox(height: 10),
        _SummaryRow(
          label: '???†Ìò∏',
          value: '$shortCount Í∞?,
          zoneLabel: 'BEAR Ï°?,
          zoneColor: const Color(0xFFFF4B4B),
          seed: 22,
        ),
        const SizedBox(height: 12),
        Expanded(
          child: _GlowBorder(
            radius: 14,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.25),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('ÏµúÍ∑º ÏßÑÏûÖ Í∏∞Î°ù', style: TextStyle(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.w800)),
                      const Spacer(),
                      const Icon(Icons.chevron_right, color: Colors.white54, size: 18),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: Column(
                      children: [
                        const _MiniLogRow(dir: 'LONG', text: 'BULL Ï°?/ ?ïÎ•† 62%'),
                        const SizedBox(height: 6),
                        const _MiniLogRow(dir: 'LONG', text: '?•ÏïÖ??Ï∫îÎì§ + Ï≤¥Í≤∞Í∞ïÎèÑ'),
                        const SizedBox(height: 6),
                        const _MiniLogRow(dir: 'SHORT', text: 'BEAR Ï°?/ ?êÏ†à Í∞ïÌôî'),
                        const Spacer(),
                        SizedBox(
                          height: 44,
                          child: CustomPaint(
                            painter: _SparklinePainter(seed: 99, color: const Color(0xFF63D7FF).withOpacity(0.95)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MiniLogRow extends StatelessWidget {
  final String dir;
  final String text;

  const _MiniLogRow({
    required this.dir,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    final isLong = dir == 'LONG';
    final c = isLong ? const Color(0xFF3CFF7F) : const Color(0xFFFF4B4B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.18), width: 1),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: c, shape: BoxShape.circle, boxShadow: [BoxShadow(color: c.withOpacity(0.25), blurRadius: 10)]),
          ),
          const SizedBox(width: 10),
          Text(dir, style: TextStyle(color: c, fontWeight: FontWeight.w900)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: Colors.white.withOpacity(0.8), fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final String zoneLabel;
  final Color zoneColor;
  final int seed;

  const _SummaryRow({
    required this.label,
    required this.value,
    required this.zoneLabel,
    required this.zoneColor,
    required this.seed,
  });

  @override
  Widget build(BuildContext context) {
    return _GlowBorder(
      radius: 14,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.25),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(label, style: TextStyle(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.w900)),
                const Spacer(),
                Text(value, style: TextStyle(color: Colors.white.withOpacity(0.85), fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(zoneLabel, style: TextStyle(color: zoneColor, fontWeight: FontWeight.w900)),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 30,
                    child: CustomPaint(
                      painter: _SparklinePainter(seed: seed, color: zoneColor.withOpacity(0.95)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(zoneLabel, style: TextStyle(color: zoneColor.withOpacity(0.8), fontWeight: FontWeight.w900)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------- Visual helpers -------------------------

class _GlowBorder extends StatelessWidget {
  final Widget child;
  final double radius;

  const _GlowBorder({
    required this.child,
    required this.radius,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0xFF7CE9FF).withOpacity(0.22), width: 1),
        boxShadow: [
          BoxShadow(color: const Color(0xFF67D9FF).withOpacity(0.10), blurRadius: 18, spreadRadius: 1),
          BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 26, spreadRadius: -10, offset: const Offset(0, 10)),
        ],
      ),
      child: ClipRRect(borderRadius: BorderRadius.circular(radius), child: child),
    );
  }
}

class _HudButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _HudButton({
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.22),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF7CE9FF).withOpacity(0.35), width: 1),
          boxShadow: [
            BoxShadow(color: const Color(0xFF67D9FF).withOpacity(0.14), blurRadius: 18, spreadRadius: 1),
          ],
        ),
        child: Text(label, style: TextStyle(color: Colors.white.withOpacity(0.92), fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  final int seed;
  final Color color;

  _SparklinePainter({
    required this.seed,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rnd = math.Random(seed);
    final points = <Offset>[];
    double y = size.height * (0.3 + rnd.nextDouble() * 0.4);
    for (int i = 0; i < 42; i++) {
      final x = i / 41 * size.width;
      y += (rnd.nextDouble() - 0.5) * (size.height * 0.18);
      y = y.clamp(size.height * 0.10, size.height * 0.90);
      points.add(Offset(x, y));
    }

    final pGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..color = color.withOpacity(0.16);
    final pLine = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..color = color.withOpacity(0.95);

    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, pGlow);
    canvas.drawPath(path, pLine);

    // baseline
    final pBase = Paint()
      ..color = Colors.white.withOpacity(0.08)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, size.height * 0.85), Offset(size.width, size.height * 0.85), pBase);
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter oldDelegate) => oldDelegate.seed != seed || oldDelegate.color != color;
}

class _GaugePainter extends CustomPainter {
  /// 0..1
  final double value;

  _GaugePainter({required this.value});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.78);
    final radius = math.min(size.width, size.height) * 0.52;

    // base arc
    final rect = Rect.fromCircle(center: center, radius: radius);
    final start = math.pi;
    final sweep = math.pi;

    final pBase = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.12);
    canvas.drawArc(rect, start, sweep, false, pBase);

    // colored segments
    final segPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round;

    void arc(double from, double to, Color c) {
      segPaint.color = c;
      canvas.drawArc(rect, start + sweep * from, sweep * (to - from), false, segPaint);
    }

    arc(0.00, 0.33, const Color(0xFFFF4B4B).withOpacity(0.90));
    arc(0.33, 0.66, const Color(0xFFFFD27A).withOpacity(0.95));
    arc(0.66, 1.00, const Color(0xFF3CFF7F).withOpacity(0.90));

    // tick marks
    final tick = Paint()
      ..color = Colors.white.withOpacity(0.22)
      ..strokeWidth = 2;
    for (int i = 0; i <= 16; i++) {
      final t = i / 16;
      final a = start + sweep * t;
      final p1 = Offset(center.dx + math.cos(a) * (radius - 26), center.dy + math.sin(a) * (radius - 26));
      final p2 = Offset(center.dx + math.cos(a) * (radius - 10), center.dy + math.sin(a) * (radius - 10));
      canvas.drawLine(p1, p2, tick);
    }

    // needle
    final needleAngle = start + sweep * value;
    final needle = Paint()
      ..color = const Color(0xFFFFD27A)
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final tip = Offset(center.dx + math.cos(needleAngle) * (radius - 30), center.dy + math.sin(needleAngle) * (radius - 30));
    canvas.drawLine(center, tip, needle);

    // needle glow
    final needleGlow = Paint()
      ..color = const Color(0xFFFFD27A).withOpacity(0.25)
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(center, tip, needleGlow);

    // knob
    final knob = Paint()..color = const Color(0xFF0A1B26);
    canvas.drawCircle(center, 16, knob);
    final knobBorder = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Colors.white.withOpacity(0.22);
    canvas.drawCircle(center, 16, knobBorder);

    // inner text
    final tp = TextPainter(
      text: TextSpan(text: 'Î™®Îìú', style: TextStyle(color: Colors.white.withOpacity(0.7), fontWeight: FontWeight.w800)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - 8));
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) => oldDelegate.value != value;
}
