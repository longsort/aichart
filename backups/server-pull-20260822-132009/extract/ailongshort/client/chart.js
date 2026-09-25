
const chart = LightweightCharts.createChart(document.getElementById("chart"),{
width:1200,
height:700
})

const candleSeries = chart.addCandlestickSeries()

async function load(){

const candles = await fetch("http://localhost:3001/candles?tf=1h").then(r=>r.json())

candleSeries.setData(candles)

const result = await fetch("http://localhost:3001/analyze?tf=1h").then(r=>r.json())

console.log("AI SIGNAL:",result.signal)

result.fvg.forEach(f=>{

candleSeries.createPriceLine({
price:f.high,
color:"orange",
title:"FVG"
})

})

}

load()
