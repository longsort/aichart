
export function detectFVG(candles){
  const r=[]
  for(let i=2;i<candles.length;i++){
    if(candles[i-2].high<candles[i].low){
      r.push({type:'FVG',low:candles[i-2].high,high:candles[i].low})
    }
  }
  return r
}
