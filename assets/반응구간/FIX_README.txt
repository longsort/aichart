
FIX SUMMARY (radar parameter error)

Error:
ultra_home_screen.dart : No named parameter with the name 'radar'

Cause:
- Widget constructor was changed (RadarWidget / DecisionRadar)
- ultra_home_screen.dart was still passing `radar:` as a named parameter

Fix Applied:
1. Removed `radar:` named parameter from widget call
2. Radar data is now injected via state/viewModel
3. Heatmap / CSV / Candle Chips are moved UNDER the mini-chart
4. Overflow guards added (Expanded / Wrap / LayoutBuilder)

This patch ONLY:
- fixes build error
- fixes overflow
- keeps engine logic intact

How to apply:
1. Unzip over current project
2. flutter clean
3. flutter run windows
