let video;


chrome.tabs.create({url: chrome.extension.getURL('viewer.html')});

// alert('try this'); // didn't work

window.addEventListener('load', async () => {
    // video = document.querySelector('video');

    //ToDo: Debug

    //*** This shows a frozen green frame
    let stream = await standbyFromVideo(); // canvas+webaudio not working

    //*** This requires clicking on the popup 5 times before the image shows
    // let stream = await standbyFromImage(); // canvas+webaudio not working

    window.stream = stream;
    console.log(stream.getTracks());
    // video.srcObject = stream;
    // await video.play()

});

const peerId = '2ceef1a5-2145-43a6-8cba-235423af1412';
let peer = new Peer(`${peerId}-ext`, {debug: 0});

peer.on('open', async id => {
    console.log('My peer ID is: ' + id);
    console.log("connected to peerServer. Trying to connect to peer");

    // try datachannel
    let conn = peer.connect(`${peerId}-viewer`);
    conn.on('data', data => console.log(`Incoming data: ${data}`));
    conn.on('connection', ()=>{
       conn.send("hello");
    });



    if (window.stream && window.stream.active) {
        let call = peer.call(`${peerId}-viewer`, window.stream);
        console.log(`started call`, call);

    }
    // otherwise wait for media to start- user might not accept permissions right away
    /*
    else


    video.onplay = () => {
            let call = peer.call(`${peerId}-viewer`, window.stream);
            console.log(`started call`, call);
        }*/

});

peer.on('connection', conn => {
    console.log("peer connected", conn);
});

peer.on('error', (err) => {
    console.error(err)
});
peer.on('close', () => console.log("Peer closed"));
peer.on('disconnected', () => console.log("Peer disconnected"));




/**
 *  Audio from webaudio
 */
// ToDo: Check for user gesture first - see: https://stackoverflow.com/questions/59150956/best-solution-for-unlocking-web-audio
function makeFakeAudio() {
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
    gainNode.gain.value = 0.2; // set to 0.1 or lower

    noise.connect(bandpass).connect(gainNode).connect(streamDestination);

    return streamDestination.stream;
}

/**
 * Canvas animation + webaudio for standby screen
 */
// ToDo: this isn't working in pop-up
async function standbyFromCanvas(width = 1920, height = 1080, framerate = 10) {

    /*
     *  Video from canvas
     */
    let canvas = document.createElement('canvas');
    canvas.id = "phonecamStandby";

    function videoFromCanvas() {

        let ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        // source: https://codepen.io/tmrDevelops/pen/vOPZBv
        let col = (x, y, r, g, b) => {
            ctx.fillStyle = `rgb(${r}, ${g}, ${b}`;
            ctx.fillRect(0, 0, 1280, 720);
            ctx.font = "86px Arial";
            ctx.fillStyle = "rgb(225,225,225)";
            ctx.fillText('phonecam not connected', 150, 300);

            // backwards text attempt
            ctx.save();
            ctx.scale(-1, 1); // Flip vertical
            ctx.fillText('phonecam not connected', 165 - 1280, 400);
            ctx.restore();

        };

        let R = (x, y, t) => Math.floor(192 + 64 * Math.cos((x * x - y * y) / 300 + t));
        let G = (x, y, t) => Math.floor(192 + 64 * Math.sin((x * x * Math.cos(t / 4) + y * y * Math.sin(t / 3)) / 300));
        let B = (x, y, t) => Math.floor(192 + 64 * Math.sin(5 * Math.sin(t / 9) + ((x - 100) * (x - 100) + (y - 100) * (y - 100)) / 1100));

        let t = 0;

        function colors() {
            for (let x = 0; x <= 35; x++) {
                for (let y = 0; y <= 35; y++) {
                    col(x, y, R(x, y, t), G(x, y, t), B(x, y, t));
                }
            }
            t = t + 0.120;
        }

        setInterval(() => requestAnimationFrame(colors), 100);

        return canvas.captureStream(framerate);
    }


    let videoTrack = videoFromCanvas().getVideoTracks()[0];
    let audioTrack = makeFakeAudio().getAudioTracks()[0];

    let standbyStream = new MediaStream([videoTrack, audioTrack]);
    console.log("created standbyStream", standbyStream.getTracks());


    // ToDo: added for debugging
    let video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = standbyStream;
    video.play().then(()=>console.log("video playing"));


    return standbyStream;
}

async function standbyFromVideo(width = 1920, height = 1080, framerate = 10) {

    // Get video from a file
    async function videoFromVideo() {
        return new Promise(async (resolve, reject) => {
            let standbyVideoElem = document.createElement('video');
            standbyVideoElem.id = "phonecamStandby";
            standbyVideoElem.width = width;
            standbyVideoElem.height = height;
            standbyVideoElem.plansinline = true;
            standbyVideoElem.muted = true;
            standbyVideoElem.loop = true;
            standbyVideoElem.autoplay = true;
            standbyVideoElem.src = "standby" +
                ".webm";
            // document.body.appendChild(standbyVideoElem); //for debugging

            let capStream = standbyVideoElem.captureStream(framerate);

            standbyVideoElem.addEventListener('playing', () => {
                console.log("playing");
                resolve(capStream);
            });

            await standbyVideoElem.play();
            //return capStream

        });

    }

    //console.log("stream", stream.getTracks());


    // webM file has audio & video
    let stream = await videoFromVideo();
    console.log("created standbyStream", stream.getTracks());
    return stream;

    /*
    let video = await videoFromVideo();

    let videoTrack = video.getVideoTracks()[0];
    let audioTrack = makeFakeAudio().getAudioTracks()[0];

    // ToDo: this is returning a promise, not a stream
    //return new MediaStream([videoTrack, audioTrack]);
    let standbyStream = await new MediaStream([audioTrack, videoTrack]);
    console.log("created standbyStream", standbyStream.getTracks());
    return standbyStream

     */
    // not sure where this promise is coming from
    //standbyStream.then(stream=>{return stream})

}

function videoFromImage(width = 1920, height = 1080, framerate = 10) {

    const img = document.querySelector('img');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = "none";

    const ctx = canvas.getContext('2d');

    // Needed otherwise the remote video never starts
    setInterval(()=>{
        ctx.drawImage(img, 0,0, width, height);
    }, 1/framerate);

    let stream = canvas.captureStream(framerate);
    console.log("image stream", stream);
    return stream

}

async function standbyFromImage(width = 1920, height = 1080, framerate = 5) {
    let video = await videoFromImage();


    let videoTrack = video.getVideoTracks()[0];
    let audioTrack = makeFakeAudio().getAudioTracks()[0];

    let standbyStream = await new MediaStream([videoTrack, audioTrack]);
    console.log("created standbyStream", standbyStream.getTracks());
    return standbyStream
}


/*
    let videoElem = document.createElement('video');
    videoElem.plansinline = true;
    videoElem.muted = true;
    videoElem.src = video;
    videoElem.play();
 */
