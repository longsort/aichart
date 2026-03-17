
const axios = require("axios")

// Binance interval map
const map = {
"1m":"1m",
"3m":"3m",
"5m":"5m",
"15m":"15m",
"1h":"1h",
"4h":"4h",
"1d":"1d",
"1w":"1w",
"1M":"1M"
}

// start timestamp BTC 2017 (Binance listing)
const start = 1502942400000

exports.load = async (symbol="BTCUSDT", tf="1h") => {

    const interval = map[tf] || "1h"

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&limit=1000`

    const res = await axios.get(url)

    return res.data.map(c => ({
        time: Math.floor(c[0]/1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4])
    }))

}
