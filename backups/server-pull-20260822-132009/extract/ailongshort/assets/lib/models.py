from dataclasses import dataclass

@dataclass
class Candle:
    open: float
    high: float
    low: float
    close: float
    volume: float

@dataclass
class Decision:
    state: str
    probability: int
    reason: str
