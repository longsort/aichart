
exports.detect = (candles)=>{

    const swings=[]

    for(let i=2;i<candles.length-2;i++){

        if(
            candles[i].high > candles[i-1].high &&
            candles[i].high > candles[i+1].high
        ){
            swings.push({
                type:"high",
                price:candles[i].high,
                index:i
            })
        }

        if(
            candles[i].low < candles[i-1].low &&
            candles[i].low < candles[i+1].low
        ){
            swings.push({
                type:"low",
                price:candles[i].low,
                index:i
            })
        }

    }

    return {swings}

}
