
exports.detect = (data)=>{

    let score = 0

    if(data.fvg.length>0) score+=1

    if(data.structure.swings.length>10) score+=1

    if(score>=2) return "LONG"

    if(score<=-2) return "SHORT"

    return "WATCH"

}
