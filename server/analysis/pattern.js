
exports.detect = (candles)=>{

    const patterns=[]

    for(let i=20;i<candles.length;i++){

        const slice=candles.slice(i-20,i)

        const highs=slice.map(c=>c.high)
        const lows=slice.map(c=>c.low)

        const highTrend=highs[highs.length-1]-highs[0]
        const lowTrend=lows[lows.length-1]-lows[0]

        if(highTrend<0 && lowTrend>0){

            patterns.push({
                type:"wedge",
                index:i
            })

        }

    }

    return patterns

}
