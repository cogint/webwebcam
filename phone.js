let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
// let openCamBtn = document.getElementById('scanQr');
let permissions = document.getElementById('scanPermission');
let warning = document.getElementById('warning');

// ToDo: Do these need to be global?
let connExt = false;
let connPage = false;

let mobile = false;
let facingMode = "user";
const CALL_RETRY_PERIOD = 2 * 1000;
let deviceIds = [];
let index = -1;
let currentDeviceId = "";
let disablePeer = false;

let peer, extCall, pageCall; // Global holders for calls

// let previewStream = new MediaStream(); // holder for preview

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
                let stream = await navigator.mediaDevices.getUserMedia({video: true});
                stream.getVideoTracks().every(track => {
                    let settings = track.getSettings();
                    if (settings.facingMode) {
                        mobile = true;
                        console.log("facingMode found");
                        return false; //break out
                    }
                })
            }
        });
    } catch (e) {
        errorHandler(e)
    }
}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getMedia() {
    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        }
    };

    // ToDo: this is freezing my Pixel4xl
    if (mobile) {
        if (facingMode === "environment") {
            facingMode = "user";
        } else {
            facingMode = "environment";
            video.classList.remove('mirror');
        }

        constraints.video.facingMode = {ideal: facingMode};

    } else {
        index++;

        if (index > deviceIds.length)
            index = 0;

        // If the next id happens to be the current selection, go to the next one
        if (currentDeviceId === deviceIds[index])
            index++;

        constraints.video.deviceId = deviceIds[index];

    }

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

    if(!newStream)
        return;

    let stream = video.srcObject;

    video.srcObject = newStream;

    if (stream){
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }



    if (extCall && extCall.open) {
        let previewTrack = newStream.getVideoTracks()[0].clone();
        await previewTrack.applyConstraints({height: 90, frameRate: 15});
        await extCall.peerConnection.getSenders()[0].replaceTrack(previewTrack);
        console.log("replaced preview stream track to peer");
    }

    if (pageCall && pageCall.open){
        let videoSender = await pageCall.peerConnection.getSenders().find(s=> {
            return s.track.kind === "video";
        });
        console.log("sender", sender);
        videoSender.replaceTrack(track);

        let audioSender = await pageCall.peerConnection.getSenders().find(s=> {
            return s.track.kind === "audio";
        });
        console.log("sender", sender);
        audioSender.replaceTrack(track);


        console.log("replaced preview stream track to peer");
    }


    //    .then(()=>previewStream.addTrack(previewTrack))
    //    .catch(err=>console.error(err));

    // ToDo: update this
    // call.peerConnection.getSenders()[0].replaceTrack(newStream.getVideoTracks()[0]);

    // connExt.send(`switch camera input to ${facingMode}`);

};


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

    peer = new Peer(`${peerId}-phone`, {debug: 0});
    let connTimeout = false;


    function handleDisconnect() {

        console.log(`Disconnected. Trying reconnect to ${connExt.peer} in ${CALL_RETRY_PERIOD / 1000} seconds`);
        connTimeout = setTimeout(() => {
            if (!connExt.open) {
                console.log(`Trying to connect to peer ${connExt} again`);
                connExt = peer.connect(`${peerId}-page`, {label: "phone<=>ext"});
            }
        }, CALL_RETRY_PERIOD);

        console.log(`Disconnected. Trying reconnect to ${connPage.peer} in ${CALL_RETRY_PERIOD / 1000} seconds`);
        connTimeout = setTimeout(() => {
            if (!connPage.open) {
                console.log(`Trying to connect to peer ${connPage.peer} again`);
                connExt = peer.connect(`${peerId}-page`, {label: "phone<=>ext"});
            }
        }, CALL_RETRY_PERIOD)
    }

    peer.on('open', async id => {
        //console.log('My peer ID is: ' + id);
        console.log(`Connected to peerServer. ${id}`);
        connExt = peer.connect(`${peerId}-ext`);
        connPage = peer.connect(`${peerId}-page`);

        [connExt, connPage].forEach(conn=>conn.on('open', () => {

            console.log(`${peer.id}: Datachannel open with ${conn.peer}`);
            connExt.on('data', function (data) {
                console.log(`${peer.id}: Received ${JSON.stringify(data)}`);
            });
        }));

        // Send the preview video
        // Video should there
        if (video.srcObject && video.srcObject.active) {

            // Preview window

            let previewStream = new MediaStream();
            let previewTrack = video.srcObject.getVideoTracks()[0].clone();
            await previewTrack.applyConstraints({height: 90, frameRate: 15});
            previewStream.addTrack(previewTrack);

            extCall = peer.call(`${peerId}-ext`, previewStream);
            console.log("initiated preview stream call");


            // ToDo: wait for a signal before trying this
            // Page
            pageCall = peer.call(`${peerId}-page`, video.srcObject);
            console.log("initiated page call");


            [extCall, pageCall].forEach(call=>{


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
    video.onloadeddata = () => extPeer(peerId);
} else
    video.onloadeddata = () => scanQr();

//window.addEventListener('DOMContentLoaded', ()=>{});


camPermissions().then(async permission => {
    if (permission) {
        video.srcObject = await getMedia();
    } else {
        warning.innerText = "click anywhere to accept media permissions";
        console.log("Camera permissions denied; waiting for user");
        permissions.style.display = "block";
        document.onclick = async () => video.srcObject = await getMedia();
        warning.style.display = "none";
    }
}).catch(err => errorHandler(err));


// https://f8d1715bb8a2.ngrok.io/phone.html?nopeer
// https://2189773fe177.ngrok.io/phone.html?id=9SZ81QrI5mzGNYtFFDDX
