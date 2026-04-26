FULINK PRO — FINAL BUNDLE v2 (Engine Tuning + UI Polish)

Included:
A) Engine module (config-driven)
- lib/core/ai/ai_engine.dart
- lib/core/ai/ai_weights.dart

B) HUD UI polish
- lib/ui/hud/global_hud_overlay.dart upgraded:
  - Neon ring gauge around Decision pill (animated)
  - More compact layout (mobile-first)
  - Stronger glass + scanline polish

Install:
1) Copy/overwrite:
- lib/ui/hud/*
- lib/core/ai/*

2) Ensure HUD overlay:
builder: (context, child) => Stack(
  children: [
    child ?? const SizedBox.shrink(),
    const GlobalHudOverlay(),
  ],
),

Done.
