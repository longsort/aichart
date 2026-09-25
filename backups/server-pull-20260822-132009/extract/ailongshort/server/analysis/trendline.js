
exports.detect = (swings)=>{

    const lines=[]

    for(let i=1;i<swings.length;i++){

        const a=swings[i-1]
        const b=swings[i]

        lines.push({
            x1:a.index,
            y1:a.price,
            x2:b.index,
            y2:b.price
        })

    }

    return lines

}
