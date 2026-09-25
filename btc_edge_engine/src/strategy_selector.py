from __future__ import annotations


def select_modes(frontier_rows: list[dict]) -> dict:
    """Build HIGH_FREQUENCY / BALANCED / PRECISION_75 / PRECISION_80 from frontier."""
    modes = {}
    viable = [r for r in frontier_rows if r.get("n", 0) >= 20 and r.get("net_ev", -1) is not None]
    if not viable:
        return {"HIGH_FREQUENCY": None, "BALANCED": None, "PRECISION_75": "unavailable", "PRECISION_80": "unavailable"}

    # HF: most trades with net_ev>0
    pos = [r for r in viable if r.get("net_ev", -999) > 0]
    if pos:
        modes["HIGH_FREQUENCY"] = max(pos, key=lambda x: x.get("n", 0))
        modes["BALANCED"] = max(pos, key=lambda x: (x.get("net_ev", 0), -x.get("max_dd", 1)))
    else:
        modes["HIGH_FREQUENCY"] = max(viable, key=lambda x: x.get("net_ev", -999))
        modes["BALANCED"] = modes["HIGH_FREQUENCY"]

    def pick_precision(thr: float):
        cands = [
            r
            for r in viable
            if r.get("threshold") is not None
            and float(r["threshold"]) >= thr
            and r.get("win_rate", 0) >= thr
            and r.get("net_ev", -999) > 0
        ]
        if not cands:
            return "unavailable"
        return max(cands, key=lambda x: (x.get("net_ev", 0), x.get("n", 0)))

    modes["PRECISION_75"] = pick_precision(0.75)
    modes["PRECISION_80"] = pick_precision(0.80)
    return modes
