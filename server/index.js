
const express = require("express")
const cors = require("cors")

const candles = require("./data/candles")
const engine = require("./analysis/engine")

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

app.listen(3001,()=>{
    console.log("AI LONGSHORT ENGINE RUNNING :3001")
})
