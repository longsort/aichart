from src.label_engine import simulate_tp_sl_path
import numpy as np


def test_tp_sl_ambiguous_timeout():
    # flat then spike both ways same bar → ambiguous
    close = np.array([100.0, 100.0, 100.0])
    high = np.array([100.0, 101.0, 100.0])
    low = np.array([100.0, 99.0, 100.0])
    code, _ = simulate_tp_sl_path(high, low, close, 0, "LONG", tp_pct=0.005, sl_pct=0.005, hold=2)
    assert code == -1

    high2 = np.array([100.0, 100.6, 100.6])
    low2 = np.array([100.0, 99.9, 99.9])
    code2, ret = simulate_tp_sl_path(high2, low2, close, 0, "LONG", tp_pct=0.005, sl_pct=0.01, hold=2)
    assert code2 == 1
    assert abs(ret - 0.005) < 1e-9

    high3 = np.array([100.0, 100.1, 100.1])
    low3 = np.array([100.0, 99.4, 99.4])
    code3, ret3 = simulate_tp_sl_path(high3, low3, close, 0, "LONG", tp_pct=0.01, sl_pct=0.005, hold=2)
    assert code3 == 0
