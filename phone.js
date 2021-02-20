let video = document.querySelector('video');
let videoBtn = document.querySelector('button');

const phoneId = '2ceef1a5-2145-43a6-8cba-235423af1411-phone';
const extId = '2ceef1a5-2145-43a6-8cba-235423af1411-ext';
let peer = new Peer(phoneId, {debug: 3});

const conn = peer.connect(extId);

let index = -1;

async function getMedia(videoDeviceId) {
    try {
        if (video.srcObject)
            video.srcObject.getTracks().forEach(track => track.stop());

        video.srcObject = await navigator.mediaDevices.getUserMedia({
            video: {
                width: {ideal: 1920},
                height: {ideal: 1080},
                deviceId: {exact: videoDeviceId}
            }
        })
    } catch (e) {
        console.error(e.name + ": " + e.message);
    }
}

videoBtn.onclick = async () => {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videoDevices = devices.filter(device => device.kind === "videoinput");

    index++;
    if (index >= videoDevices.length)
        index = 0;
    await getMedia(videoDevices[index].deviceId);
    console.log(`selected video device: ${videoDevices[index].label}`);
};

peer.on('disconnected', () => console.log("Peer disconnected"));

peer.on('open', async id => {
    console.log('My peer ID is: ' + id);

    stream = await getMedia();
    //peer.call(extId, stream);
});
