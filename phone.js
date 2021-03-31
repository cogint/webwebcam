let video = document.querySelector('video');
let changeCam = document.getElementById('changeCam');
let openCamBtn = document.getElementById('scanQr');
let permissions = document.getElementById('scanPermission');
let warning = document.getElementById('warning');

let conn;
let mobile = false;
let facingMode = "user";
const CALL_RETRY_PERIOD = 2*1000;
let deviceIds = [];
let index = -1;
let currentDeviceId = "";
let disablePeer = false;

function errorHandler(error){
    console.error(error)
    // ToDo: send this over peerjs
    // console.error(`${e.name}: ${e.message}`);
    // conn.send(`${e.name}: ${e.message}`);
}

// Scans all video devices to see if facing mode is available
async function scanDevices(){
    console.log("device scan");
    try{
        let devices = await navigator.mediaDevices.enumerateDevices();
        devices.forEach(async device=>{
           if(device.kind==="videoinput"){
               console.log(device);
               deviceIds.push(device.deviceId);
               let stream = await navigator.mediaDevices.getUserMedia({video: true} );
               stream.getVideoTracks().every(track=>{
                   let settings = track.getSettings();
                   if(settings.facingMode){
                       mobile = true;
                       console.log("facingMode found");
                       return false; //break out
                   }
               })
           }
        });
    } catch (e) {errorHandler(e)}
}

// getUserMedia wrapper that checks for facing mode or device in case of mobile
async function getMedia() {
    let constraints = {
        video: {
            width: {ideal: 1920},
            height: {ideal: 1080}
        }};

    // ToDo: this is freezing my Pixel4xl
    if(mobile){
        if (facingMode === "environment"){
            facingMode = "user";
        }
        else{
            facingMode = "environment";
            video.classList.remove('mirror');
        }

        constraints.video.facingMode = {ideal: facingMode};

    }
    else{
        index++;

        if(index > deviceIds.length)
            index=0;

        // If the next id happens to be the current selection, go to the next one
        if(currentDeviceId === deviceIds[index])
            index++;

        constraints.video.deviceId = deviceIds[index];

       }

    // How get the stream
    try {
        console.log(constraints);

        let stream = await navigator.mediaDevices.getUserMedia(constraints);

        let currentDeviceSettings = stream.getVideoTracks()[0].getSettings();
        currentDeviceId = currentDeviceSettings.deviceId;
        if(currentDeviceSettings.facingMode==="environment")
            video.classList.remove('mirror');
        else
            video.classList.add('mirror');


        if(deviceIds.length <= 0){
            await scanDevices();
        }
        return stream;
    } catch (e) {errorHandler(e)}

}

changeCam.onclick = async () => {


    if (video.srcObject)
        video.srcObject.getTracks().forEach(track => track.stop());

    let newStream = await getMedia();
    video.srcObject = newStream;

    // ToDo: update this
    // call.peerConnection.getSenders()[0].replaceTrack(newStream.getVideoTracks()[0]);

    // conn.send(`switch camera input to ${facingMode}`);

};

function startPeer(peerId){

    // For debugging
    if(urlParams.has("nopeer")){
        disablePeer = true;
        console.log("peerjs disabled from url parameter");
        return;
    }

    let peer = new Peer(`${peerId}-phone`, {debug: 3});
    let connTimeout = false;

    function startCall(){
        // wait for a connection
        conn.on('open',()=>{
            //conn.on('data', data => console.log(`Incoming data: ${data}`))
            console.log("connection established; starting call");
            if (connTimeout) clearTimeout(connTimeout);
            // conn.send({devices: devices}); //ToDo: didn't work
            peer.call(`${peerId}-page`, video.srcObject);
        });
    }


    peer.on('open',  id=> {
        console.log('My peer ID is: ' + id);
        console.log("connected to peerServer. Trying to connect to peer");
        conn = peer.connect(`${peerId}-page`);
        // start the call if already playing
        if(video.srcObject && video.srcObject.active)
            startCall();
        // otherwise wait for media to start- user might not accept permissions right away
        else
            video.onplay = ()=> startCall();
    });

    peer.on('error', (err)=>{
        if(err.type === 'peer-unavailable'){
            console.log(`Peer wasn't available right now. Trying again in ${CALL_RETRY_PERIOD/1000} seconds`);
            connTimeout = setTimeout(()=>{
                if(!conn.open){
                    console.log("trying to connect to peer again");
                    conn = peer.connect(`${peerId}-page`);
                }
            }, 5*CALL_RETRY_PERIOD)

        }
        else
            console.error(err)
    });
    peer.on('close', ()=>console.log("Peer closed"));
    peer.on('disconnected', ()=>console.log("Peer disconnected"));

    /*
    peer.on('disconnected', () => console.log("Peer disconnected"));

    peer.on('open', async id => {
        console.log('My peer ID is: ' + id);
        //let stream = await getMedia();
        // video.srcObject = stream;
        stream = video.srcObject;
        call = peer.call(`${peerId}-page`, stream);
    });
     */



}


// check gUM permissions
async function camPermissions() {
    // ToDo: adapt for FF & Safari
    // this doesn't work on Safari or FF

    return new Promise( async (resolve, reject) =>{
        navigator.permissions.query({name: "camera"})
            .then(status=>{
                console.log("gUM permission status", status.state);
                resolve(status.state === "granted");
            })
        .catch(err=>reject(err))
    });


    // let devices = await navigator.mediaDevices.enumerateDevices();
    // let videoDevices = devices.filter(device => device.kind === "videoinput" && device.label !== "");
    // console.log(videoDevices);
    // return videoDevices.length > 0
}



async function scanQr(){
    let canvas = document.createElement('canvas');
    //let canvas  = document.querySelector('canvas');
    let ctx = canvas.getContext("2d");
    console.log("looking for QR code");

    function checkQr() {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let imageData = ctx.getImageData(0,0,canvas.width, canvas.height);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {});

        if(code){
            console.log(code.data);
            if(code.data.toLowerCase().includes("phonecam")) {
                let peerId = JSON.parse(code.data).phonecam;
                if(peerId) {
                    console.log(`scanned ID: ${peerId}`);
                    startPeer(peerId);
                }
                else{
                    // This was giving violation errors
                    requestAnimationFrame(checkQr);
                    console.log("bad QR code");
                }
            }
        }
        else
            requestAnimationFrame(checkQr);
    }

    checkQr();
}

const urlParams = new URLSearchParams(window.location.search);


if(urlParams.has("id")){
    let peerId = urlParams.get("id");
    console.log(`Using peerid ${peerId} from URL params`);
    video.onloadeddata = () => startPeer(peerId);
}
else
    video.onloadeddata = ()=> scanQr();

//window.addEventListener('DOMContentLoaded', ()=>{});


camPermissions().then(async permission=>{
    if(permission) {
        video.srcObject = await getMedia();
    } else {
        warning.innerText = "click anywhere to accept media permissions";
        console.log("Camera permissions denied; waiting for user");
        permissions.style.display = "block";
        document.onclick = async () => video.srcObject = await getMedia();
        warning.style.display = "none";
    }
}).catch(err=>errorHandler(err));



// https://f8d1715bb8a2.ngrok.io/phone.html?nopeer
