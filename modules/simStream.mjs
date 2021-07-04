/**
 * Generates a stream from generated sources (not a webcam)
 */

// ToDo: turn this whole file into a class

let vidFromImgInterval = false; // Needed to stop videoFromImage

// Stream from a static image
function videoFromImage(imageFile, width = 1920, height = 1080, frameRate = 10, frameShiftFreq = 10) {

    try {
        const img = new Image();
        img.src = imageFile;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.display = "none";

        const ctx = canvas.getContext('2d');

        // finding: see if an requestAnimationFrame reduces CPU
        // - it didn't; it doesn't play at unless it is locally displayed by popup.js
        // that would work ok if we pushed simstream to the tab

        // Shift the image slightly every n frames

        // How many frames to shift the image
        // needed ot prevent frozen video checkers from triggering
        const offset = 7; //7
        let randOffset = Math.floor(Math.random() * offset + 1);
        let offsetCounter = 0;


        // Needed otherwise the remote video never starts
        vidFromImgInterval = setInterval(() => {
            // Shift the image slightly every frameShiftFreq frames
            offsetCounter++;
            if(offsetCounter > frameShiftFreq){
                randOffset = Math.floor(Math.random() * offset + 1);
                offsetCounter = 0;
            }

            ctx.drawImage(img, randOffset, randOffset, width, height);
        }, 1 / frameRate);

        let stream = canvas.captureStream(frameRate);

        // ToDo: overload MedaiStreamTrack to assign a custom video track label
        // This didn't work
        // let videoTrack = stream.getVideoTracks()[0];
        // videoTrack.label = "WebWebCam Standby";

        console.log("image stream", stream);
        return stream
    } catch (err) {
        console.error(err);
    }
}

// Stream from a video file
async function streamFromVideo(videoFile, width = 1920, height = 1080, frameRate = 10) {
    let sourceVideo = document.createElement('video');
    sourceVideo.src = videoFile;
    sourceVideo.muted = true;
    sourceVideo.loop = true;
    await sourceVideo.play();

    let stream = sourceVideo.captureStream();
    console.log("videoFile stream", stream);

    // ToDo: I don't think this worked
    let videoTrack = stream.getVideoTracks()[0];
    videoTrack.label = "WebWebCam Standby";
    await videoTrack.applyConstraints({width: width, height: height, frameRate: frameRate});

    return stream;
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
export async function getStandbyStream({method = 'video', file, audioEnabled = true, width = 1920, height = 1080, frameRate = 10, volume = 0.05}) {

    let video, standbyStream;

    if (method === 'video')
        video = await streamFromVideo(file, width, height, frameRate);
    else
        video = await videoFromImage(file, width, height, frameRate);


    let videoTrack = video.getVideoTracks()[0];

    if (audioEnabled) {
        let audioTrack = audioFromWebAudio(volume).getAudioTracks()[0];
        standbyStream = await new MediaStream([videoTrack, audioTrack]);
    } else {
        console.log("Audio stream disabled. Proceeding with video only");
        standbyStream = await new MediaStream([videoTrack]);
    }


    console.log("created standbyStream", standbyStream.getTracks());
    return standbyStream

}

export function stopStandbyStream(stream){
    if(vidFromImgInterval)
        clearInterval(vidFromImgInterval);
    stream.getTracks().forEach(track=>track.stop());
    console.log("standbyStream stopped");
}
