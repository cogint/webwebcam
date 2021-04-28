/**
 * Generates a stream from generated sources (not a webcam)
 */


// Stream from a static image
function videoFromImage(width = 1920, height = 1080, framerate = 10) {

    const img = new Image();
    img.src = "assets/standby.png";

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = "none";

    const ctx = canvas.getContext('2d');

    // ToDo: see if an requestAnimationFrame reduces CPU

    // Shift the image slightly every 2 seconds
    const offset = 7;
    const imgShiftTimer = 2* 1000;
    let randOffset =  Math.floor(Math.random() * offset+1);
    setInterval(()=>{
        randOffset =  Math.floor(Math.random() * offset+1);
    }, imgShiftTimer);

    // Needed otherwise the remote video never starts
    setInterval(() => {
        // ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, randOffset, randOffset, width, height);
    }, 1 / framerate);

    let stream = canvas.captureStream(framerate);
    console.log("image stream", stream);
    return stream

}


// stream from a brown noise generator
function audioFromWebAudio(volume = 0.05) {
    let audioCtx = new AudioContext();
    let streamDestination = audioCtx.createMediaStreamDestination();

    //Brown noise

    let bufferSize = 2 * audioCtx.sampleRate,
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate),
        output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    let noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noise.start(0);

    // https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques#adding_a_biquad_filter_to_the_mix

    let bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;

    // lower the volume
    const gainNode = audioCtx.createGain();

    // needs to be 0.1 or lower to be unnoticeable
    // added random volume fluctuation
    gainNode.gain.value = volume * (1 + Math.random());

    noise.connect(bandpass).connect(gainNode).connect(streamDestination);

    return streamDestination.stream;
}


// combine audio + video
export async function getStandbyStream(width = 1920, height = 1080, framerate = 10, volume=0.05) {

    let video = await videoFromImage(width, height, framerate);

    let videoTrack = video.getVideoTracks()[0];
    let audioTrack = audioFromWebAudio(volume).getAudioTracks()[0];

    let standbyStream = await new MediaStream([videoTrack, audioTrack]);
    console.log("created standbyStream", standbyStream.getTracks());
    return standbyStream

}

