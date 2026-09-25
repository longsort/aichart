import json
from models import Candle
from engine import decide

data = json.load(open("data/sample_candles.json"))
c_high = Candle(**data["1d"])
c_mid = Candle(**data["1h"])

res = decide(c_high, c_mid, stop_pct=0.012)
print(res)
