import {mungeH264} from "./modules/mungeH264.mjs";

let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
// let openCamBtn = document.getElementById('scanQr');
let permissions = document.getElementById('scanPermission');
let status = document.getElementById('status');

// let mobile = false;
// let facingMode = "user";
const CALL_RETRY_PERIOD = 2 * 1000;
let deviceIds = [];
let index = -1;
let currentDeviceId = "";
let disablePeer = false;

let peer, extCall, pageCall; // Global holders for calls
let stream = null; // make this global for debugging


function errorHandler(error) {
    console.error(error)
    // ToDo: send this over peerjs
    // console.error(`${e.name}: ${e.message}`);
    // connExt.send(`${e.name}: ${e.message}`);
}

// Scans all video devices to see if facing mode is available
async function scanDevices() {
    console.log("device scan");
    try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        devices.forEach(async device => {
            if (device.kind === "videoinput") {
                console.log(device);
                deviceIds.push(device.deviceId);

                // ToDo: come back to this facingMode to force front/back on mobile
                /*
                stream = await navigator.mediaDevices.getUserMedia({video: true});
                stream.getVideoTracks().every(track => {
                    let settings = track.getSettings();
                    if (settings.facingMode) {
                        mobile = true;
                        console.log("facingMode found");
                        return false; //break out
                    }
                })
                 */
            }
        });
    } catch (e) {
        errorHandler(e)
    }
}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getMedia(init=false) {
    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        }
    };

    // ToDo: this is freezing my Pixel4xl
    /*
    if (mobile) {
        if (facingMode === "environment") {
            facingMode = "user";
        } else {
            facingMode = "environment";
            video.classList.remove('mirror');
        }

        constraints.video.facingMode = {ideal: facingMode};



    } else {
    */
        if(!init)
            index++;

        if (index > deviceIds.length)
            index = 0;

        // If the next id happens to be the current selection, go to the next one
        if (currentDeviceId === deviceIds[index])
            index++;

        constraints.video.deviceId = deviceIds[index];

    //}

    // How get the stream
    try {
        console.log(constraints);

        let stream = await navigator.mediaDevices.getUserMedia(constraints);

        let currentDeviceSettings = stream.getVideoTracks()[0].getSettings();
        currentDeviceId = currentDeviceSettings.deviceId;
        if (currentDeviceSettings.facingMode === "environment")
            video.classList.remove('mirror');
        else
            video.classList.add('mirror');


        if (deviceIds.length <= 0) {
            await scanDevices();
        }
        return stream;
    } catch (e) {
        errorHandler(e)
    }

}

changeCam.onclick = async () => {


    // ToDo: catch errors
    let newStream = await getMedia().catch(err=>{
        console.error(err);
    });

    if(newStream.id === stream.id){
        console.log("the same stream was returned, trying again");
        newStream = await getMedia().catch(err=>console.error(err));
        //ToDo: check deviceIds for the same?
    }


    if (extCall && extCall.open){
        let videoSender = await pageCall.peerConnection.getSenders().find(s=> {
            return s.track.kind === "video";
        });
        console.log("videoSender", videoSender);
        let newVideoTrack = newStream.getVideoTracks()[0];
        videoSender.replaceTrack(newVideoTrack);

        let audioSender = await pageCall.peerConnection.getSenders().find(s=> {
            return s.track.kind === "audio";
        });
        console.log("audioSender", audioSender);
        let newAudioTrack = newStream.getAudioTracks()[0];
        audioSender.replaceTrack(newAudioTrack);

        console.log("replaced preview stream track to peer");
    }

    stream.getTracks().forEach(track => track.stop());
    stream = newStream;

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
            let call = peer.call(`${peerId}-ext`, stream, {sdpTransform: mungeH264});
            console.log("initiated preview stream call");

            call.on('close', ()=>{console.log("mediaConnection ended")})
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


    // let devices = await navigator.mediaDevices.enumerateDevices();
    // let videoDevices = devices.filter(device => device.kind === "videoinput" && device.label !== "");
    // console.log(videoDevices);
    // return videoDevices.length > 0
}


async function scanQr() {
    let canvas = document.createElement('canvas');
    //let canvas  = document.querySelector('canvas');
    let ctx = canvas.getContext("2d");
    console.log("looking for QR code");

    function checkQr() {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {});

        if (code) {
            console.log(code.data);
            if (code.data.toLowerCase().includes("phonecam")) {
                let peerId = JSON.parse(code.data).phonecam;
                if (peerId) {
                    console.log(`scanned ID: ${peerId}`);
                    extPeer(peerId);
                } else {
                    // This was giving violation errors
                    requestAnimationFrame(checkQr);
                    console.log("bad QR code");
                }
            }
        } else
            requestAnimationFrame(checkQr);
    }

    checkQr();
}

const urlParams = new URLSearchParams(window.location.search);


if (urlParams.has("id")) {
    let peerId = urlParams.get("id");
    console.log(`Using peerid ${peerId} from URL params`);
    // permissions.classList.add('d-none');
    video.onloadeddata = () => extPeer(peerId);
} else
    video.onloadeddata = () => scanQr();

//window.addEventListener('DOMContentLoaded', ()=>{});


camPermissions().then(async permission => {
    if (permission) {
        stream = await getMedia(true);
        video.srcObject = stream;
    } else {
        status.innerText = "click anywhere to accept media permissions";
        console.log("Camera permissions denied; waiting for user");
        // permissions.classList.remove('d-none');
        document.onclick = async () => {
            stream = await getMedia(true);
            video.srcObject = stream;
            status.classList.add('d-none');
        }
    }
}).catch(err => errorHandler(err));
