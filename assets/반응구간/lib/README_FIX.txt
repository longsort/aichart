HOTFIX: Area-specific fold/unfold flicker

What changed:
- SmartLayoutPanel: on desktop, force SINGLE-COLUMN layout to eliminate width-jitter oscillation.
- Added RepaintBoundary around left/right blocks.

Apply:
1) Unzip and overwrite into your project root.
2) flutter clean
3) flutter pub get
4) flutter run -d windows
