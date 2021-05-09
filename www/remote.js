import {mungeH264} from "./modules/mungeH264.mjs";

let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
let status = document.getElementById('status');
let statusDiv = document.getElementById('statusDiv');
let clickForCam =  document.getElementById('clickForCam');

const CALL_RETRY_PERIOD = 2 * 1000;
let deviceIds = [];
let index = 0;
let currentDeviceId = "";
let disablePeer = false;

let peer, extCall; // Global holders for calls
let peerId = false;
let stream = null; // make this global for debugging

function errorHandler(error) {
    console.error(error)
    // ToDo: send this over peerjs
    // console.error(`${e.name}: ${e.message}`);
    // connExt.send(`${e.name}: ${e.message}`);
}

function updateDevices(devices){
    // ToDo: handle audio
    deviceIds = [];
    devices.forEach(device => {
        if (device.kind === "videoinput") {
            // console.log(device);
            deviceIds.push(device.deviceId);
        }
    });
    window.deviceIds = deviceIds;
    console.log("new device ids", deviceIds)
}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getNextVideoDevice() {

    /*
        console.log("device scan");
        navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            devices.forEach(async device => {
                if (device.kind === "videoinput") {
                    // console.log(device);
                    deviceIds.push(device.deviceId);
                }
            });
        })
        .catch(console.error);
     */

    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        },
        audio: true
    };

    index++;

    if (index >= deviceIds.length)
        index = 0;

    // If the next id happens to be the current selection, go to the next one
    if (currentDeviceId === deviceIds[index])
        index++;

    constraints.video.deviceId = {exact: deviceIds[index]};

    // How get the stream
    try {
        console.log(JSON.stringify(constraints));

        let gumStream = await navigator.mediaDevices.getUserMedia(constraints);
        // window.stream = stream; // for debugging

        let currentDeviceSettings = stream.getVideoTracks()[0].getSettings();
        currentDeviceId = currentDeviceSettings.deviceId;

        navigator.mediaDevices.enumerateDevices().then(updateDevices);
        return gumStream;
    } catch (e) {
        errorHandler(e)
    }

}

changeCam.onclick = async () => {

    // ToDo: sometimes the same camera comes back twice

    status.innerText = "switching camera";
    stopQrScan = true;

    // ToDo: catch errors
    let newStream = await getNextVideoDevice().catch(err => {
        console.error(err);
    });

    if (newStream.id === stream.id) {
        console.log("the same stream was returned, trying again");
        newStream = await await getNextVideoDevice().catch(err => console.error(err));
        //ToDo: check deviceIds for the same?
    }


    // newStream.getTracks().forEach(track=>stream.addTrack(track));
    video.srcObject = newStream;

    console.log("extCall status", extCall);
    if (extCall && extCall.open) {
        let videoSender = await extCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "video";
        });
        console.log("videoSender", videoSender);
        let newVideoTrack = newStream.getVideoTracks()[0];
        await videoSender.replaceTrack(newVideoTrack);

        let audioSender = await extCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "audio";
        });
        console.log("audioSender", audioSender);
        let newAudioTrack = newStream.getAudioTracks()[0];
        await audioSender.replaceTrack(newAudioTrack);

        console.log("replaced preview stream track to peer");
        status.innerText = "connected to webwebcam extension";

    } else if (!peerId){
        video.onloadeddata = async () => {
            video.onloadeddata = null;
            await scanQr();
        }
    }
    else{
        console.error("Invalid state after changecam");
    }

    stream.getTracks().forEach(track => track.stop());
    stream = newStream;
    window.stream = stream;
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
            extCall = peer.call(`${peerId}-ext`, stream); //, {sdpTransform: mungeH264});
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
        }
        else console.log("Local stream issue; skipping call", stream);
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
            .then(permission => {
                console.log("gUM permission status", permission.state);
                resolve(permission.state === "granted");
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
    status.innerText = "looking for QR code";

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
                    status.innerText = "invalid QR code";
                    requestAnimationFrame(checkQr);
                }
            }
        } else{}
            requestAnimationFrame(checkQr);
    }

    checkQr();
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("id") || urlParams.has("i")) {
    peerId = urlParams.get("id") || urlParams.get("i");
    console.log(`Using peerid ${peerId} from URL params`);
}


//window.addEventListener('DOMContentLoaded', ()=>{});



async function startMedia(){
    let startingConstraints = {video: {width: {ideal: 1920}, height: {ideal: 1080}}, audio: true };

    stream = await navigator.mediaDevices.getUserMedia(startingConstraints);
    video.srcObject = stream;

    changeCam.classList.remove("d-none");

    if(peerId){
        video.onloadeddata = () => {
            video.onloadeddata = null;
            extPeer(peerId);
        };
        status.innerText = "connecting to webwebcam extension";
    }
    else{
        video.onloadeddata = async () => {
            video.onloadeddata = null;
            await scanQr()
        };
    }

    // Populate the device list
    navigator.mediaDevices.enumerateDevices().then(updateDevices);


}

camPermissions().then(async permission => {
    if (permission) {
        clickForCam.classList.add("d-none");
        statusDiv.classList.remove("d-none");
        await startMedia();

    } else {
        //status.innerText = ""; // ToDo: remove
        console.log("Camera permissions denied; waiting for user");
        // permissions.classList.remove('d-none');
        document.onclick = async () => {
            clickForCam.classList.add("d-none");
            statusDiv.classList.remove("d-none");
            status.innerText = "accept camera and microphone permissions in the popup prompt";
            document.onclick = null;
            await startMedia();
        };
    }
}).catch(err => errorHandler(err));

window.addEventListener('beforeunload', () => {
    peer.destroy();
});
