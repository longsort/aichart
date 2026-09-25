const express = require("express")
const cors = require("cors")

const candles = require("./data/candles")
const engine = require("./analysis/engine")

const port = Number(process.env.SERVER_PORT || 3001)
/** 같은 머신의 Next만 붙이면 127.0.0.1 권장. 컨테이너 분리 시 0.0.0.0 + CANDLES_SERVER_URL */
const host = String(process.env.CANDLE_SERVER_HOST || "127.0.0.1").trim() || "127.0.0.1"

const app = express()
app.use(cors())
app.use(express.json())

// timeframes supported
// 1m 3m 5m 15m 1h 4h 1d 1w 1M 1Y

app.get("/candles", async (req,res)=>{

    const symbol = req.query.symbol || "BTCUSDT"
    const tf = req.query.tf || "1h"

    const data = await candles.load(symbol,tf)

    res.json(data)

})

app.get("/analyze", async (req,res)=>{

    const symbol = req.query.symbol || "BTCUSDT"
    const tf = req.query.tf || "1h"

    const data = await candles.load(symbol,tf)

    const result = engine.run(data)

    res.json(result)

})

app.listen(port, host, () => {
  console.log(`[candles] listening http://${host}:${port}`)
})
