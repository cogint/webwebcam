/*
 * SDP munger to prioritize H.264
 * Searches for "h264" a lines and rewrites the m line to put the H.264 options first
 *
 */

export function mungeH264(sdp) {

    const aLinesRe = /a=rtpmap:(\d+)\sH264/gi;
    const h264maps = [...sdp.matchAll(aLinesRe)].map(m => m[1]);

    const mLineRe = /m=video\s\d+\s([[A-Z|\/]+)\s([0-9| ]+)/gi;
    const mLine = [...sdp.matchAll(mLineRe)][0];

    console.log("original m= line", mLine[0]);

    let newMaps = mLine[2];

    h264maps.forEach(map => {
        newMaps = newMaps.replace(`${map} `, "");
    });
    newMaps = h264maps.join(' ').concat(' ').concat(newMaps);
    const newMline = mLine[0].replace(mLine[2], newMaps);
    console.log("new m= line", newMline);

    return sdp.replace(mLine[0], newMline);
}
