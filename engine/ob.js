
export function detectOB(candles){
  const r=[]
  for(let i=1;i<candles.length;i++){
    if(candles[i].close>candles[i].open && candles[i-1].close<candles[i-1].open){
      r.push({type:'BullishOB',price:candles[i-1].low})
    }
  }
  return r
}
