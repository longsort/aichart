const express = require("express");
const cors = require("cors");

let candles, engine;
try {
  candles = require("./data/candles");
  engine = require("./analysis/engine");
} catch (e) {
  console.error("[server] require error:", e?.message || e);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.SERVER_PORT || 3001;

// timeframes: 1m 3m 5m 15m 1h 4h 1d 1w 1M
app.get("/candles", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  const tf = req.query.tf || "1h";
  try {
    const data = await candles.load(symbol, tf);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn("[server] /candles error:", err?.message || err);
    res.json([]);
  }
});

app.get("/analyze", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  const tf = req.query.tf || "1h";
  try {
    const data = await candles.load(symbol, tf);
    const list = Array.isArray(data) ? data : [];
    const result = engine.run(list);
    res.json(result);
  } catch (err) {
    console.warn("[server] /analyze error:", err?.message || err);
    res.status(500).json({ error: err?.message || "analyze failed" });
  }
});

app.listen(port, () => {
  console.log("[server] AI LONGSHORT ENGINE RUNNING on port", port);
});
