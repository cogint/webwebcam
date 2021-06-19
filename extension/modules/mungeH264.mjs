/*
 * SDP munger to prioritize H.264
 * Searches for "h264" a lines and rewrites the m line to put the H.264 options first
 *
 */

// ToDo: bug here: https://bugs.chromium.org/p/chromium/issues/detail?id=1132965
export function preferH264(sdp) {

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

// This didn't work: Failed to setLocalDescription, " – "(OperationError) Failed to parse video codecs correctly."
export function removeH264HighProfile(sdp){

    console.log("original SDP\n", sdp);

    const aLinesRe = /a=fmtp:(\d+)\s.+profile-level-id=640c1f/gi;
    const h264maps = [...sdp.matchAll(aLinesRe)].map(m => m[1]);

    const mLineRe = /m=video\s\d+\s([[A-Z|\/]+)\s([0-9| ]+)/gi;
    const mLine = [...sdp.matchAll(mLineRe)][0];

    console.log("original m= line", mLine[0]);

    let newMaps = mLine[2];

    h264maps.forEach(map => {
        newMaps = newMaps.replace(`${map} `, "");
    });

    // Remove h264 HP maps;
    // newMaps = newMaps.concat(' ').concat(h264maps.join(' '));
    const newMline = mLine[0].replace(mLine[2], newMaps);
    console.log("new m= line", newMline);

    return sdp.replace(mLine[0], newMline);
}

// This didn't work
export function removeH264(sdp){

    console.log("original SDP\n", sdp);

    const aLinesRe = /a=rtpmap:(\d+)\sH264/gi;
    const h264maps = [...sdp.matchAll(aLinesRe)].map(m => m[1]);

    console.log(h264maps);

    const mLineRe = /m=video\s\d+\s([[A-Z|\/]+)\s([0-9| ]+)/gi;
    const mLine = [...sdp.matchAll(mLineRe)][0];

    console.log("original m= line", mLine[0]);

    let newMline = mLine[0];
    h264maps.forEach(map => {
        newMline = newMline.replace(`${map} `, "");
    });

    console.log("new m= line", newMline);

    const newSDP = sdp.replace(mLine[0], newMline);
    console.log("new SDP\n", newSDP);

    return newSDP
}

// This didn't work
export function dontPreferH264hp(sdp){

    console.log("original SDP\n", sdp);

    // Find the video m line
    const mLineRe = /m=video\s\d+\s([[A-Z|\/]+)\s([0-9| ]+)/gi;
    const mLine = [...sdp.matchAll(mLineRe)][0];

    console.log("original m= line", mLine[0]);

    // Find the a lines with H.264 High Profile and extract the numeric maps
    const ah264hpLinesRe = /a=fmtp:(\d+)\s.+profile-level-id=640c1f/gi;
    const hpMaps = [...sdp.matchAll(ah264hpLinesRe)].map(m => m[1]);

    // find any codec enhancement lines that depend on those hpMaps
    hpMaps.forEach(hpMap => {
        const aptLinesRe = new RegExp(`a=fmtp:(\\d+)\\sapt=${hpMap}`, 'gi');
        let hpAptMap = [...sdp.matchAll(aptLinesRe)].map(m => m[1]);
        //console.log(...hpAptMap);
        if(hpAptMap)
            hpMaps.push(...hpAptMap);
    });

    console.log("hpMaps: ", hpMaps);

    // Get just the numeric mapping parts for manipulation
    let newMaps = mLine[2];

    // remove each H.264 HP mapping from the m line
    hpMaps.forEach(map => {
        newMaps = newMaps.replace(`${map} `, "");
    });

    // now add them back at the end
    newMaps = newMaps.concat(' ').concat(hpMaps.join(' '));

    // replace the m line mappings with the new ones
    const newMline = mLine[0].replace(mLine[2], newMaps);
    console.log("new m= line", newMline);

    return sdp.replace(mLine[0], newMline);
}

//     newMaps = h264maps.join(' ').concat(' ').concat(newMaps);
export function preferVP8(sdp) {
    console.log("Preferring VP8");

    // Find the video m line
    const mLineRe = /m=video\s\d+\s([[A-Z|\/]+)\s([0-9| ]+)/gi;
    const mLine = [...sdp.matchAll(mLineRe)][0];
    console.log("original m= line", mLine[0]);

    // Find the a lines with VP8 and extract the numeric maps
    const aLinesRe = /a=rtpmap:(\d+)\sVP8/gi;
    const vp8maps = [...sdp.matchAll(aLinesRe)].map(m => m[1]);

    // find any codec enhancement lines that depend on those hpMaps
    vp8maps.forEach(hpMap => {
        const aptLinesRe = new RegExp(`a=fmtp:(\\d+)\\sapt=${hpMap}`, 'gi');
        let aptMap = [...sdp.matchAll(aptLinesRe)].map(m => m[1]);
        //console.log(...hpAptMap);
        if(aptMap)
            vp8maps.push(...aptMap);
    });

    let newMaps = mLine[2];

    vp8maps.forEach(map => {
        newMaps = newMaps.replace(`${map} `, "");
    });
    newMaps = vp8maps.join(' ').concat(' ').concat(newMaps);
    let newMline = mLine[0].replace(mLine[2], newMaps);
    console.log("new m= line", newMline);

    return sdp.replace(mLine[0], newMline);
}
