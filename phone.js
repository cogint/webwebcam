let video = document.querySelector('video');
let camFacing = document.querySelector('#camfacing');
let openCamBtn = document.querySelector('#scan');
let permissions = document.querySelector('#scanPermission');

let conn;
let facingMode = "user";
const CALL_RETRY_PERIOD = 2*1000;


async function getMedia() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: {
                width: {ideal: 1920},
                height: {ideal: 1080},
                facingMode: {ideal: facingMode},
                // deviceId: {ideal: "a5acfaac553287b2f3d8404c35b73acc91f42785c74537da2da364b6c2bc9bfd"}
            }
        });
    } catch (e) {
        console.error(`${e.name}: ${e.message}`);
        conn.send(`${e.name}: ${e.message}`);
    }
}

camFacing.onclick = async () => {
    if(facingMode==="environment")
        facingMode="user";
    else
        facingMode = "environment";

    if (video.srcObject)
        video.srcObject.getTracks().forEach(track => track.stop());

    let newStream = await getMedia();
    video.srcObject = newStream;

    // ToDo: update this
    // call.peerConnection.getSenders()[0].replaceTrack(newStream.getVideoTracks()[0]);

    // conn.send(`switch camera input to ${facingMode}`);

};

function startPeer(peerId){
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
async function camPermsissions() {
    // this doesn't work on Safari or FF
    /*let status = await navigator.permissions.query({name: "camera"});
    console.log("gUM permission status", status.state);
    return status.state === "granted"
     */
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videoDevices = devices.filter(device => device.kind === "videoinput" && device.label !== "");
    console.log(videoDevices);
    return videoDevices.length > 0
}



async function scan(){
    let canvas = document.createElement('canvas');
    //let canvas  = document.querySelector('canvas');
    let ctx = canvas.getContext("2d");
    console.log("looking for QR code");

    function checkQR() {
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
                    requestAnimationFrame(checkQR);
                    console.log("bad QR code");
                }
            }
        }
        else
            requestAnimationFrame(checkQR);
    }

    checkQR();
}


if(!camPermsissions()){
    console.log("Camera permissions denied; waiting for user");
    permissions.style.display = "block";
    openCamBtn.onclick = async () => stream = await getMedia();
}
else{
    getMedia().then(stream=>{
        video.srcObject = stream;
    });
    video.onloadeddata = ()=> scan();

}
