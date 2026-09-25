
export function detectBOS(candles){
  const result=[]
  for(let i=2;i<candles.length;i++){
    if(candles[i].high>candles[i-1].high && candles[i].high>candles[i-2].high){
      result.push({type:'BOS',price:candles[i].high})
    }
  }
  return result
}
