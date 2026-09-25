
exports.detect = (candles)=>{

    const gaps=[]

    for(let i=2;i<candles.length;i++){

        const c1=candles[i-2]
        const c3=candles[i]

        if(c1.high < c3.low){

            gaps.push({
                type:"bullish",
                high:c3.low,
                low:c1.high,
                index:i
            })

        }

        if(c1.low > c3.high){

            gaps.push({
                type:"bearish",
                high:c1.low,
                low:c3.high,
                index:i
            })

        }

    }

    return gaps

}
