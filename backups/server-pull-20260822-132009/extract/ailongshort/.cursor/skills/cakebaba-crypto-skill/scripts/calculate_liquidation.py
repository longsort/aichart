#!/usr/bin/env python3
"""
calculate_liquidation.py — 爆倉價計算器(Cakebaba Crypto Skill)

支援:
- USDT 永續合約(Binance、Bybit、Crypto.com、OKX 等主流交易所)
- 全倉(Cross)同逐倉(Isolated)兩種模式
- 多頭(Long)同空頭(Short)兩種方向
- 不同槓桿、不同維持保證金率

公式(USDT 永續合約,逐倉模式):

  做多爆倉價 ≈ Entry × (1 - 1/Leverage + Maintenance Margin Rate + Fee Rate)
  做空爆倉價 ≈ Entry × (1 + 1/Leverage - Maintenance Margin Rate - Fee Rate)

維持保證金率(MMR)視交易所同交易對而定,常見值:
- Binance USDT 永續(BTC/ETH 主流):0.4% - 0.5%
- 山寨幣:0.5% - 1.0%
- 高槓桿級別:MMR 會上升

Usage:
  python3 calculate_liquidation.py --entry 75400 --leverage 100 --direction long
  python3 calculate_liquidation.py --entry 75400 --leverage 50 --direction short --mmr 0.005
  python3 calculate_liquidation.py --entry 85.89 --leverage 100 --direction long --mmr 0.01
  python3 calculate_liquidation.py --entry 75400 --leverage 50 --direction long --stop-loss 74800

  # 全部級別一次過睇:
  python3 calculate_liquidation.py --entry 75400 --direction long --all-leverages
"""

import argparse
import json
import sys
from typing import Dict, List, Optional


def calculate_liquidation_price(
    entry_price: float,
    leverage: int,
    direction: str,
    mmr: float = 0.005,
    fee_rate: float = 0.0004,
) -> float:
    """
    計算爆倉價(USDT 永續合約,逐倉模式)

    Args:
        entry_price: 入場價
        leverage: 槓桿倍數(如 10、50、100)
        direction: 'long' 或 'short'
        mmr: 維持保證金率(預設 0.5%)
        fee_rate: 平倉手續費率(預設 0.04%,Binance taker)

    Returns:
        爆倉價(USD)
    """
    if direction.lower() == "long":
        # 多頭:價格下跌爆倉
        liq_price = entry_price * (1 - 1 / leverage + mmr + fee_rate)
    elif direction.lower() == "short":
        # 空頭:價格上漲爆倉
        liq_price = entry_price * (1 + 1 / leverage - mmr - fee_rate)
    else:
        raise ValueError(f"Invalid direction: {direction}. Use 'long' or 'short'.")

    return liq_price


def calculate_distance_percent(entry: float, liq: float) -> float:
    """計算爆倉價距離入場價嘅百分比"""
    return abs((liq - entry) / entry) * 100


def assess_risk(
    distance_pct: float,
    leverage: int,
    stop_loss_distance_pct: Optional[float] = None,
) -> Dict[str, str]:
    """
    根據爆倉距離評估風險等級

    Cakebaba 風險評估邏輯:
    - 距離 < 1%:極高風險(任何波動都爆倉)
    - 距離 1-2%:高風險(需要精準入場)
    - 距離 2-5%:中等風險
    - 距離 > 5%:低風險

    如果有 stop loss,計算 SL/Liq 緩衝:
    - SL 距離 < 50% × Liq 距離:安全(止損會先觸發)
    - SL 距離 ≥ 80% × Liq 距離:危險(可能爆倉先於止損)
    """
    if distance_pct < 1:
        risk_level = "🔥 極高風險 (CRITICAL)"
        warning = "任何 0.5% 波動都可能爆倉。倉位必須 ≤ 1% 總資金。"
    elif distance_pct < 2:
        risk_level = "🔴 高風險 (HIGH)"
        warning = "100x 級別嘅典型距離。倉位建議 ≤ 2% 總資金。"
    elif distance_pct < 5:
        risk_level = "🟡 中等風險 (MEDIUM)"
        warning = "50x 級別嘅典型距離。倉位 5-10% 總資金。"
    elif distance_pct < 10:
        risk_level = "🟢 低風險 (LOW)"
        warning = "10-20x 級別。倉位 10-20% 總資金。"
    else:
        risk_level = "✅ 極低風險 (SAFE)"
        warning = "10x 以下槓桿。可承受較大波動。"

    result = {
        "risk_level": risk_level,
        "warning": warning,
    }

    if stop_loss_distance_pct is not None:
        ratio = stop_loss_distance_pct / distance_pct
        if ratio < 0.5:
            sl_assessment = f"✅ 止損安全:SL 距離 ({stop_loss_distance_pct:.2f}%) 係爆倉距離 ({distance_pct:.2f}%) 嘅 {ratio*100:.0f}%,止損會先觸發"
        elif ratio < 0.8:
            sl_assessment = f"🟡 止損偏緊:SL 距離 ({stop_loss_distance_pct:.2f}%) 係爆倉距離 ({distance_pct:.2f}%) 嘅 {ratio*100:.0f}%,接近爆倉,小心滑點"
        else:
            sl_assessment = f"🔴 危險:SL 距離 ({stop_loss_distance_pct:.2f}%) 接近爆倉距離 ({distance_pct:.2f}%),可能爆倉先於止損 — 建議收緊止損或降槓桿"
        result["stop_loss_assessment"] = sl_assessment

    return result


def calculate_all_leverages(
    entry: float,
    direction: str,
    mmr: float = 0.005,
    fee_rate: float = 0.0004,
    stop_loss: Optional[float] = None,
) -> List[Dict]:
    """計算所有常見槓桿級別嘅爆倉價"""
    leverages = [10, 25, 50, 75, 100]
    results = []

    sl_distance_pct = None
    if stop_loss is not None:
        sl_distance_pct = abs((stop_loss - entry) / entry) * 100

    for lev in leverages:
        liq = calculate_liquidation_price(entry, lev, direction, mmr, fee_rate)
        distance = calculate_distance_percent(entry, liq)
        risk = assess_risk(distance, lev, sl_distance_pct)

        results.append(
            {
                "leverage": f"{lev}x",
                "liquidation_price": round(liq, 2),
                "distance_pct": round(distance, 2),
                "risk_level": risk["risk_level"],
                "warning": risk["warning"],
                "stop_loss_assessment": risk.get("stop_loss_assessment", "N/A"),
            }
        )

    return results


def format_output(result: Dict, json_output: bool = False) -> str:
    """格式化輸出"""
    if json_output:
        return json.dumps(result, indent=2, ensure_ascii=False)

    # Human-readable text output
    if "all_leverages" in result:
        output = []
        output.append("=" * 70)
        output.append(f"🔴 爆倉價計算 — {result['direction'].upper()} @ ${result['entry']:,.2f}")
        output.append(f"   維持保證金率: {result['mmr']*100}% | 手續費: {result['fee_rate']*100}%")
        if result.get("stop_loss"):
            output.append(f"   止損: ${result['stop_loss']:,.2f}")
        output.append("=" * 70)
        output.append("")

        for r in result["all_leverages"]:
            output.append(f"📊 {r['leverage']:>4} 槓桿")
            output.append(f"   爆倉價: ${r['liquidation_price']:,.2f} (距離入場 {r['distance_pct']}%)")
            output.append(f"   風險: {r['risk_level']}")
            output.append(f"   建議: {r['warning']}")
            if r["stop_loss_assessment"] != "N/A":
                output.append(f"   {r['stop_loss_assessment']}")
            output.append("")

        return "\n".join(output)

    # Single leverage output
    output = []
    output.append("=" * 70)
    output.append(f"🔴 爆倉價計算")
    output.append("=" * 70)
    output.append(f"方向:       {result['direction'].upper()}")
    output.append(f"入場價:     ${result['entry']:,.2f}")
    output.append(f"槓桿:       {result['leverage']}x")
    output.append(f"維持保證金: {result['mmr']*100}%")
    output.append(f"手續費:     {result['fee_rate']*100}%")
    output.append("-" * 70)
    output.append(f"🔴 爆倉價:   ${result['liquidation_price']:,.2f}")
    output.append(f"   距離入場: {result['distance_pct']}%")
    output.append(f"   風險等級: {result['risk_level']}")
    output.append(f"   建議:     {result['warning']}")

    if result.get("stop_loss") is not None:
        output.append("-" * 70)
        output.append(f"止損價:     ${result['stop_loss']:,.2f}")
        output.append(f"止損距離:   {result['stop_loss_distance_pct']}%")
        output.append(f"   {result['stop_loss_assessment']}")

    output.append("=" * 70)
    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(
        description="爆倉價計算器 - Cakebaba Crypto Skill",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--entry", type=float, required=True, help="入場價(USD),如 75400"
    )
    parser.add_argument(
        "--direction",
        type=str,
        required=True,
        choices=["long", "short"],
        help="方向:long(做多)或 short(做空)",
    )
    parser.add_argument(
        "--leverage",
        type=int,
        default=None,
        help="槓桿倍數(如 10、50、100)。如果用 --all-leverages 則唔需要",
    )
    parser.add_argument(
        "--all-leverages",
        action="store_true",
        help="一次過計算 10x / 25x / 50x / 75x / 100x 所有級別",
    )
    parser.add_argument(
        "--mmr",
        type=float,
        default=0.005,
        help="維持保證金率(預設 0.005 = 0.5%%,主流 BTC/ETH 永續)",
    )
    parser.add_argument(
        "--fee-rate",
        type=float,
        default=0.0004,
        help="平倉手續費率(預設 0.0004 = 0.04%%,Binance taker)",
    )
    parser.add_argument(
        "--stop-loss",
        type=float,
        default=None,
        help="止損價(可選)。提供之後會評估止損是否安全",
    )
    parser.add_argument(
        "--json", action="store_true", help="輸出 JSON 格式而唔係文字"
    )

    args = parser.parse_args()

    # Validation
    if not args.all_leverages and args.leverage is None:
        print("錯誤:必須提供 --leverage 或者用 --all-leverages", file=sys.stderr)
        sys.exit(1)

    if args.all_leverages:
        results = calculate_all_leverages(
            entry=args.entry,
            direction=args.direction,
            mmr=args.mmr,
            fee_rate=args.fee_rate,
            stop_loss=args.stop_loss,
        )
        output_data = {
            "entry": args.entry,
            "direction": args.direction,
            "mmr": args.mmr,
            "fee_rate": args.fee_rate,
            "stop_loss": args.stop_loss,
            "all_leverages": results,
        }
    else:
        liq = calculate_liquidation_price(
            args.entry, args.leverage, args.direction, args.mmr, args.fee_rate
        )
        distance = calculate_distance_percent(args.entry, liq)

        sl_distance_pct = None
        if args.stop_loss is not None:
            sl_distance_pct = abs((args.stop_loss - args.entry) / args.entry) * 100

        risk = assess_risk(distance, args.leverage, sl_distance_pct)

        output_data = {
            "entry": args.entry,
            "direction": args.direction,
            "leverage": args.leverage,
            "mmr": args.mmr,
            "fee_rate": args.fee_rate,
            "liquidation_price": round(liq, 2),
            "distance_pct": round(distance, 2),
            "risk_level": risk["risk_level"],
            "warning": risk["warning"],
        }

        if args.stop_loss is not None:
            output_data["stop_loss"] = args.stop_loss
            output_data["stop_loss_distance_pct"] = round(sl_distance_pct, 2)
            output_data["stop_loss_assessment"] = risk.get(
                "stop_loss_assessment", "N/A"
            )

    print(format_output(output_data, json_output=args.json))


if __name__ == "__main__":
    main()
