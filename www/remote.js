import {mungeH264} from "./modules/mungeH264.mjs";

let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
let changeMic = document.getElementById('changeMic');
let flipCam = document.getElementById('flipCam');

let status = document.getElementById('status');
let controlsBar = document.getElementById('controlsBar');

const CALL_RETRY_PERIOD = 2 * 1000;
const AUDIO_ENABLED = false;

//ToDo: uses these in the regex match
const PEER_ID_LENGHT_MIN = 8;
const PEER_ID_LENGHT_MAX = 20;


// For switching media devices
let videoDevices = [];
let audioDevices = [];
let videoIndex = 0;
let audioIndex = 0;
let currentVideoDeviceId = "";
let currentAudioDeviceId = "";


let disablePeer = false;

let peer, extCall; // Global holders for calls
let peerId = false;
let currentStream = null; // make this global for debugging

function errorHandler(error) {
    console.error(error)
    // ToDo: send this over peerjs
    // console.error(`${e.name}: ${e.message}`);
    // connExt.send(`${e.name}: ${e.message}`);
}

function updateDevices(devices) {
    // ToDo: handle audio
    videoDevices = [];
    audioDevices = [];
    devices.forEach(device => {
        if (device.kind === "videoinput") {
            // console.log(device);
            videoDevices.push(device);
        }
        if (device.kind === "audioinput") {
            // console.log(device);
            audioDevices.push(device);
        }
    });

    // For debugging
    // window.videoDeviceIds = videoDevices;
    // window.audioDeviceIds = audioDevices;
    console.log("new video device ids", videoDevices);
    console.log("new audio device ids", audioDevices);

}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getNextDevice(video=false, audio=false) {

    const devices = await navigator.mediaDevices.enumerateDevices();
    updateDevices(devices);


    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        },
        audio: {

        }
    };

    if(video){
        videoIndex++;

        if (videoIndex >= videoDevices.length)
            videoIndex = 0;

        // If the next id happens to be the current selection, go to the next one
        if (currentVideoDeviceId === videoDevices[videoIndex].id)
            videoIndex++;

        constraints.video.deviceId = {exact: videoDevices[videoIndex].deviceId};
    }

    if(audio){
        audioIndex++;

        if (audioIndex >= audioDevices.length)
            audioIndex = 0;

        // If the next id happens to be the current selection, go to the next one
        if (currentAudioDeviceId === audioDevices[audioIndex].id)
            audioIndex++;

        constraints.audio.deviceId = {exact: audioDevices[audioIndex].deviceId};
    }


    // How get the stream
    try {
        console.log("attempting gUM with the following constraints: ", JSON.stringify(constraints));

        let gumStream = await navigator.mediaDevices.getUserMedia(constraints);

        // window.stream = gumStream; // for debugging

        if(video){
            let currentVideoDeviceSettings = gumStream.getVideoTracks()[0].getSettings();
            currentVideoDeviceId = currentVideoDeviceSettings.deviceId;

            // If the track is ended for sme reason go to the next one
            if (gumStream.getVideoTracks()[0].readyState === "ended") {
                console.log("new track unexpectedly ended, moving to the next one");
                await getNextDevice(audio, video);
            }
        }

        if(audio){
            let currentAudioDeviceSettings = gumStream.getAudioTracks()[0].getSettings();
            currentVideoDeviceId = currentAudioDeviceSettings.deviceId;

            // If the track is ended for sme reason go to the next one
            if (gumStream.getAudioTracks()[0].readyState === "ended") {
                console.log("new track unexpectedly ended, moving to the next one");
                await getNextDevice(audio, video);
            }
        }

        return gumStream;
    } catch (e) {
        errorHandler(e)
    }

}

// Swap peer.js peerConnection tracks with the newStream
async function switchStream(newStream){
    if (extCall && extCall.open) {
        console.log("extCall status", extCall);

        // replace the video track
        let videoSender = await extCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "video";
        });
        console.log("videoSender", videoSender);
        let newVideoTrack = newStream.getVideoTracks()[0];
        await videoSender.replaceTrack(newVideoTrack);

        // replace the audio track
        if (AUDIO_ENABLED){
            let audioSender = await extCall.peerConnection.getSenders().find(s => {
                return s.track.kind === "audio";
            });
            console.log("audioSender", audioSender);
            let newAudioTrack = newStream.getAudioTracks()[0];
            await audioSender.replaceTrack(newAudioTrack);
        }


        console.log("replaced preview stream track to peer");
        status.innerText = "connected to webwebcam extension";

    } else if (!peerId) {
        video.onloadeddata = async () => {
            video.onloadeddata = null;
            await scanQr();
        }
    } else {
        console.error("Invalid state after changecam");
    }

    currentStream.getTracks().forEach(track => track.stop());
    currentStream = newStream;
    window.stream = currentStream;
    newStream = null;

}

changeMic.onclick = async  ()=>{
    status.innerText = "switching microphone";

    let newStream = await getNextDevice(false, true).catch(async err => {
        console.error("error acquiring stream on changeCam", err);
        // try again
        console.log("Trying on the next video device");
        newStream = await getNextDevice(false, true);
    });
    console.log("new stream acquired", newStream);

    if (newStream.id === currentStream.id) {
        console.log("the same stream was returned, trying again");
        newStream = await getNextDevice(false, true).catch(err => console.error(err));
    }

    video.srcObject = newStream;

    await switchStream(newStream);

};

// Cam change button handler
changeCam.onclick = async () => {

    // ToDo: sometimes the same camera comes back twice

    status.innerText = "switching camera";
    stopQrScan = true;

    let newStream = await getNextDevice(true, false).catch(async err => {
        console.error("error acquiring stream on changeCam", err);
        // try again
        console.log("Trying on the next video device");
        newStream = await getNextDevice(true, false);
    });
    console.log("new stream acquired", newStream);

    if (newStream.id === currentStream.id) {
        console.log("the same stream was returned, trying again");
        newStream = await getNextDevice(true, false).catch(err => console.error(err));
        //ToDo: check deviceIds for the same?
    }


    // newStream.getTracks().forEach(track=>stream.addTrack(track));
    adjustMirror(newStream);
    video.srcObject = newStream;

    await switchStream(newStream);

};

// Cam mirror button handler
flipCam.onclick = () => {
    video.classList.toggle("mirror");
    console.log("changed video mirroring");
};

let connExt = null;

function extPeer(peerId) {

    // For debugging
    if (urlParams.has("nopeer")) {
        disablePeer = true;
        console.log("peerjs disabled from url parameter");
        return;
    }

    if (peer && peer.id) {
        console.log(`${connExt.label}: peerjs already connected`);
        return;
    }

    peer = new Peer(`${peerId}-remote`, {debug: 0});
    let connTimeout = false;


    function handleDisconnect() {

        console.log(`Disconnected. Trying reconnect to ${connExt.peer} in ${CALL_RETRY_PERIOD / 1000} seconds`);
        connTimeout = setTimeout(() => {
            if (!connExt.open) {
                console.log(`Trying to connect to peer ${connExt} again`);
                connExt = peer.connect(`${peerId}-ext`, {label: "remote<=>ext"});
            }
        }, CALL_RETRY_PERIOD);
    }


    peer.on('open', async id => {

        console.log(`Connected to peerServer with id: ${id}`);
        let connExt = peer.connect(`${peerId}-ext`);

        connExt.on('open', () => {

            console.log(`${peer.id}: Datachannel open with ${connExt.peer}`);
            connExt.on('data', function (data) {
                console.log(`${peer.id}: Received ${JSON.stringify(data)}`);
            });
        });

        // Send the preview video
        // Video should there
        if (currentStream && currentStream.active) {
            // ToD:  bug is preventing H.264 from working:
            extCall = peer.call(`${peerId}-ext`, currentStream); //, {sdpTransform: mungeH264});
            console.log("initiated preview stream call");
            status.innerText = "connected to webwebcam extension";

            extCall.on('error', err => {
                console.error(err);
                status.innerText = "Call error";
            });

            extCall.on('close', () => {
                console.log("mediaConnection ended");
                status.innerText = "Extension disconnected.";
            });
        } else console.log("Local stream issue; skipping call", currentStream);
    });

    // User notice to install / check the extension
    peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
            console.error(err);
            console.log(`${peer.id}: Extension Peer isn't available right now.`);
            handleDisconnect();
        } else
            console.error(err)
    });

    peer.on('close', () => {
        console.log(`${peer.id}: Peer closed`);
        handleDisconnect();
    });

    peer.on('disconnected', (e) => {
        console.log(`${peer.id}: peer disconnected from server. Attempting to reconnect`, e);
        peer.reconnect();
    });

}



// QR scanning
let stopQrScan = false;
async function scanQr() {

    let canvas = document.createElement('canvas');
    //let canvas  = document.querySelector('canvas');
    let ctx = canvas.getContext("2d");

    console.log("looking for QR code");
    status.innerText = "looking for QR code";

    stopQrScan = false;

    function checkQr() {
        if (stopQrScan) {
            console.log("stopped QR scan");
            return;
        }

        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {});

        if (code) {
            console.log(`scanned data: ${code.data}`);
            // check for a url, then check for webweb.cam, then a valid ID
            const codeSearch = code.data.match(/(?:http?s:\/\/webweb.cam(?:\/|\?i=))([0-9a-zA-Z]{8,20})/i);
            console.log(`codesearch: ${codeSearch}`);

            const peerId = codeSearch ? codeSearch[1] : null;

            if (peerId) {
                console.log(`scanned ID: ${peerId}`);
                extPeer(peerId);
                stopQrScan = true;
            }
            //old method looks for JSON
            else if (code.data.toLowerCase().includes("webwebcam")) {
                let peerId = JSON.parse(code.data).webwebcam;
                if (peerId) {
                    console.log(`scanned ID: ${peerId}`);
                    extPeer(peerId);
                    stopQrScan = true;
                } else {
                    // This was giving violation errors
                    console.log("bad QR code");
                    status.innerText = "invalid QR code";
                    requestAnimationFrame(checkQr);
                }
            }
        } else {
            requestAnimationFrame(checkQr);
        }
    }

    checkQr();
}

// Checks the URL to see if an ID is included
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("id") || urlParams.has("i")) {
    peerId = urlParams.get("id") || urlParams.get("i");
    console.log(`Using peerid ${peerId} from URL params`);
}


// Flips the
function adjustMirror(stream){
    const label = stream.getVideoTracks()[0].label;
    const videoTrackSettings = stream.getVideoTracks()[0].getSettings();

    if(videoTrackSettings.facingMode){
        console.log(`current camera has facing mode: ${videoTrackSettings.facingMode}`);
        if(videoTrackSettings.facingMode === "environment" || label.match(/back|environment/i))
            video.classList.remove("mirror");
        if(videoTrackSettings.facingMode === "user" || label.match(/front|user/i))
            video.classList.add("mirror");
        else
            video.classList.add("mirror");
    }
    else
        console.log("No facingMode setting on current video track");
}


// Capture media
async function startMedia() {
    let startingConstraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080},
            facingMode: {ideal: peerId ? "user" : "environment"} // If no QR ask for env cam
        }, audio: true
    };


    currentStream = await navigator.mediaDevices.getUserMedia(startingConstraints);
    adjustMirror(currentStream);

    video.srcObject = currentStream;
    window.stream = currentStream;

    controlsBar.classList.remove('d-none');

    if (peerId) {
        video.onloadeddata = () => {
            video.onloadeddata = null;
            extPeer(peerId);
        };
        status.innerText = "connecting to webwebcam extension";
    } else {
        video.onloadeddata = async () => {
            video.onloadeddata = null;
            await scanQr()
        };
    }

    // Populate the device list
    navigator.mediaDevices.enumerateDevices().then(updateDevices);

    // Go fullscreen
    // ToDo: experiment with fullscreen for mobile; needs a gesture; check Safari
    /*
    const docEl = window.document.documentElement;
    if(docEl.requestFullscreen)
       await  docEl.requestFullscreen();
     */

}

// check gUM permissions
async function camPermissions() {
    // ToDo: adapt for FF & Safari
    // this doesn't work on Safari or FF

    return new Promise(async (resolve, reject) => {

        if(navigator.permissions && navigator.permissions.query){
            navigator.permissions.query({name: "camera"})
                .then(permission => {
                    console.log("gUM permission status", permission.state);
                    resolve(permission.state === "granted");
                })
                .catch(err => reject(err))
        }
        else {
            resolve(false);
        }
    });
}

// Make sure there are camera permissions before starting media
camPermissions().then(async permission => {
    if (permission) {
        status.innerText = AUDIO_ENABLED ? "acquiring camera and microphone": "acquiring camera";
        await startMedia();

    } else {
        //status.innerText = ""; // ToDo: remove
        console.log("Camera permissions denied; waiting for user");
        // permissions.classList.remove('d-none');
        document.onclick = async () => {
            status.innerText = "accept camera and microphone permissions in the popup prompt";
            document.onclick = null;
            await startMedia();
        };
    }
}).catch(err => errorHandler(err));

// enable poo-overs
$(function () {
    $('[data-toggle="tooltip"]').tooltip()
});


window.addEventListener('beforeunload', () => {
    if(peer)
        peer.destroy();
});
