from models import Decision
from config import RISK_LIMIT

def higher_tf_bias(c):
    if c.close > c.open: return "LONG"
    if c.close < c.open: return "SHORT"
    return "WAIT"

def structure_bias(c):
    mid = (c.high + c.low) / 2
    if c.close < mid: return "LONG"
    if c.close > mid: return "SHORT"
    return "WAIT"

def decide(c_high, c_mid, stop_pct):
    if stop_pct > RISK_LIMIT:
        return Decision("WAIT", 0, "리스크 초과")
    bias = higher_tf_bias(c_high)
    struct = structure_bias(c_mid)
    if bias == struct and bias != "WAIT":
        return Decision(bias, 55, "구조 일치")
    return Decision("WAIT", 20, "근거 부족")
