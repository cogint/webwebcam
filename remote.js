import {mungeH264} from "./extension/modules/mungeH264.mjs";

let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
let status = document.getElementById('status');
let clickForCam =  document.getElementById('clickForCam');

const CALL_RETRY_PERIOD = 2 * 1000;
let deviceIds = [];
let index = 1;
let currentDeviceId = "";
let disablePeer = false;

let peer, extCall, pageCall; // Global holders for calls
let peerId = false;
let stream = null; // make this global for debugging

function errorHandler(error) {
    console.error(error)
    // ToDo: send this over peerjs
    // console.error(`${e.name}: ${e.message}`);
    // connExt.send(`${e.name}: ${e.message}`);
}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getNextVideoDevice() {

    console.log("device scan");
    try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        devices.forEach(async device => {
            if (device.kind === "videoinput") {
                // console.log(device);
                deviceIds.push(device.deviceId);
            }
        });
    } catch (e) {
        errorHandler(e)
    }



    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        },
        audio: true
    };

    index++;

    if (index > deviceIds.length)
        index = 0;

    // If the next id happens to be the current selection, go to the next one
    if (currentDeviceId === deviceIds[index])
        index++;

    constraints.video.deviceId = {exact: deviceIds[index]};

    // How get the stream
    try {
        console.log(JSON.stringify(constraints));

        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.stream = stream; // for debugging


        let currentDeviceSettings = stream.getVideoTracks()[0].getSettings();
        currentDeviceId = currentDeviceSettings.deviceId;

        return stream;
    } catch (e) {
        errorHandler(e)
    }

}

changeCam.onclick = async () => {


    // ToDo: catch errors
    let newStream = await getNextVideoDevice().catch(err => {
        console.error(err);
    });

    if (newStream.id === stream.id) {
        console.log("the same stream was returned, trying again");
        newStream = await getMedia().catch(err => console.error(err));
        //ToDo: check deviceIds for the same?
    }

    stopQrScan = true;

    stream.getTracks().forEach(track => track.stop());
    // newStream.getTracks().forEach(track=>stream.addTrack(track));
    video.srcObject = newStream;

    if (extCall && extCall.open) {
        let videoSender = await pageCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "video";
        });
        console.log("videoSender", videoSender);
        let newVideoTrack = newStream.getVideoTracks()[0];
        await videoSender.replaceTrack(newVideoTrack);

        let audioSender = await pageCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "audio";
        });
        console.log("audioSender", audioSender);
        let newAudioTrack = newStream.getAudioTracks()[0];
        await audioSender.replaceTrack(newAudioTrack);

        console.log("replaced preview stream track to peer");
    } else {
        video.onloadeddata = async () => await scanQr();
    }

    stream = newStream;
    newStream = null;

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
        if (stream && stream.active) {
            // ToD:  bug is preventing H.264 from working:
            let call = peer.call(`${peerId}-ext`, stream); //, {sdpTransform: mungeH264});
            console.log("initiated preview stream call");

            call.on('close', () => {
                console.log("mediaConnection ended")
            })
        }
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


// check gUM permissions
async function camPermissions() {
    // ToDo: adapt for FF & Safari
    // this doesn't work on Safari or FF

    return new Promise(async (resolve, reject) => {
        navigator.permissions.query({name: "camera"})
            .then(status => {
                console.log("gUM permission status", status.state);
                resolve(status.state === "granted");
            })
            .catch(err => reject(err))
    });
}

let stopQrScan = false;
async function scanQr() {
    let canvas = document.createElement('canvas');
    //let canvas  = document.querySelector('canvas');
    let ctx = canvas.getContext("2d");
    console.log("looking for QR code");

    stopQrScan = false;
    function checkQr() {
        if(stopQrScan) {
            console.log("stopped QR scan");
            return;
        }

        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {});

        if (code) {
            console.log(code.data);
            if (code.data.toLowerCase().includes("webwebcam")) {
                let peerId = JSON.parse(code.data).webwebcam;
                if (peerId) {
                    console.log(`scanned ID: ${peerId}`);
                    extPeer(peerId);
                    stopQrScan = true;
                } else {
                    // This was giving violation errors
                    console.log("bad QR code");
                    requestAnimationFrame(checkQr);
                }
            }
        } else{}
            requestAnimationFrame(checkQr);
    }

    checkQr();
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("id")) {
    peerId = urlParams.get("id");
    console.log(`Using peerid ${peerId} from URL params`);
}


//window.addEventListener('DOMContentLoaded', ()=>{});



async function startMedia(){
    let startingConstraints = {video: {width: {ideal: 1920}, height: {ideal: 1080}}, audio: true };

    stream = await navigator.mediaDevices.getUserMedia(startingConstraints);
    video.srcObject = stream;

    changeCam.classList.remove("d-none");

    if(peerId){
        video.onloadeddata = () => extPeer(peerId);
        status.innerText = "connecting to webwebcam extension";
    }
    else{
        video.onloadeddata = () => scanQr();
        status.innerText = "looking for QR code";
    }

}

camPermissions().then(async permission => {
    if (permission) {
        clickForCam.classList.add("d-none");
        await startMedia();

    } else {
        status.innerText = "some temporary text"; // ToDo: remove
        console.log("Camera permissions denied; waiting for user");
        // permissions.classList.remove('d-none');
        document.onclick = async () => {
            await startMedia();
        };
    }
}).catch(err => errorHandler(err));

window.addEventListener('beforeunload', () => {
    peer.destroy();
});
