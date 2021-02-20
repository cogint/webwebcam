let video = document.querySelector('video');
let videoBtn = document.querySelector('button');

const phoneId = '2ceef1a5-2145-43a6-8cba-235423af1411-phone';
const extId = '2ceef1a5-2145-43a6-8cba-235423af1411-ext';
let peer = new Peer(phoneId, {debug: 3});
let call;

const conn = peer.connect(extId);

conn.on('data', function(data) {
        console.log('Received', data);
});


let facingMode = "user";

async function getMedia() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: {
                width: {ideal: 1920},
                height: {ideal: 1080},
                facingMode: {ideal: facingMode}
            }
        });
    } catch (e) {
        console.error(`${e.name}: ${e.message}`);
        conn.send(`${e.name}: ${e.message}`);
    }
}

videoBtn.onclick = async () => {
    if(facingMode==="environment")
        facingMode="user";
    else
        facingMode = "environment";

    if (video.srcObject)
        video.srcObject.getTracks().forEach(track => track.stop());

    let newStream = await getMedia();
    video.srcObject = newStream;
    call.peerConnection.getSenders()[0].replaceTrack(newStream.getVideoTracks()[0]);

    conn.send(`switch camera input to ${facingMode}`);

};

peer.on('disconnected', () => console.log("Peer disconnected"));

peer.on('open', async id => {
    console.log('My peer ID is: ' + id);

    let stream = await getMedia();
    video.srcObject = stream;
    call = peer.call(extId, stream);

});
