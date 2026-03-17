
const structure = require("./structure")
const fvg = require("./fvg")
const trend = require("./trendline")
const signal = require("./signal")

exports.run = (candles)=>{

    const s = structure.detect(candles)
    const g = fvg.detect(candles)
    const t = trend.detect(s.swings)

    const sig = signal.detect({
        structure:s,
        fvg:g
    })

    return {
        structure:s,
        fvg:g,
        trendlines:t,
        signal:sig
    }

}
