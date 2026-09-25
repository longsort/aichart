# BTC 15M Autonomous Edge Discovery — FINAL REPORT

- generated: 2026-09-25T12:17:37.381780+00:00
- bars: 37347
- range: 2025-08-21T12:00:00+00:00 → 2026-09-25T12:00:00+00:00
- features: 127

## Answers (20)

1. OOS에서 NetEV>0 설정 수=0 / frontier=20 · best={'side': 'SHORT', 'n': 161, 'n_all': 161, 'ambiguous_rate': 0.0, 'tp_first_rate': 0.11801242236024845, 'win_rate': 0.22981366459627328, 'net_ev': -0.02702052783387284, 'sum_net': -4.350304981253528, 'profit_factor': 0.2807064544194082, 'max_dd': 0.9909290177676862, 'longest_loss_streak': 15, 'median_net': -0.052000000000000005, 'leverage': 20, 'target_roi': 0.07, 'sl': 0.001, 'hold': 8, 'threshold': 0.65, 'mode': 'model'}
2. LONG best EV=-0.03371555102437926 · SHORT best EV=-0.029558667749843663
3. regime별 상세는 pattern_clusters + market_regime 분포 참고 (클러스터 regime_mode)
4. ablation full AUC=0.5620574589269948 · sets=[('A_ohlc', 0.5413330116164327), ('B_volume', 0.5501526712601492), ('C_atr', 0.5656687672039195), ('D_rsi', 0.5501125287813999), ('E_trend', 0.55647668057407), ('F_structure', 0.5546013451517406), ('G_liquidity', 0.5595149576718661), ('H_full', 0.5620574589269948)]
5. RSI set AUC=0.5501125287813999 vs OHLC=0.5413330116164327
6. Volume set AUC=0.5501526712601492
7. Liquidity/Sweep set AUC=0.5595149576718661
8. validation best SL=0.001
9. validation best target ROI=0.07
10. leverage table OOS all-bars (diagnostic): [(10, -0.016272442178612283), (20, -0.03213103182925656), (30, -0.048404538253557346), (50, -0.08031040915957949), (75, -0.11958349783053585), (100, -0.15887192385208188)]
11. PRECISION_75 available=False · has75_netEV=False
12. PRECISION_80 available=False · has80_netEV=False
13. best n trades OOS≈161 (thresholded) · monthly=[]
14. best NetEV=-0.02702052783387284
15. best MaxDD=0.9909290177676862
16. best longest loss streak=15
17. monthly PnL spread=[]
18. stress cases=[('A_base', -0.030599894887533383), ('B_slip_+25%', -0.03265023181674583), ('C_slip_+50%', -0.03459289275644017), ('D_fee_+20%', -0.040274955399592756), ('E_both', -0.04415806719457682)]
19. clusters long ok=True n=3311 · short ok=True
20. live signal status=WAIT · models_loaded=True · promote_only_if_pos_EV_and_WF_stable

## Notes
- 확정 수익 아님 · Future leak 금지 준수 · Ambiguous≠WIN
