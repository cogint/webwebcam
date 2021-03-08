// ToDo: turn this back into an anonymous function

let phoneCamStream = false;
let usePhoneCam = false;
let connected = false;
let standbyActive = false;


/*
 * helper function
 */
function logger(message) {
    //window.postMessage(['phonecam', window.location.href, 'logger', message], '*');
    document.dispatchEvent(new CustomEvent('phonecam-inject', {
        detail: {
            // sourceUrl: window.location.href,
            entity: 'inject.js',
            logger: message
        }
    }));
    // console.log('phonecam: ', message);
}

/*
* Canvas animation for standby screen
*/

// ToDo: add stand-by audio?
function standbyStream() {
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    canvas.width = 1280;
    canvas.height = 720;

    // source: https://codepen.io/tmrDevelops/pen/vOPZBv
    let col = (x, y, r, g, b) => {
        ctx.fillStyle = `rgb(${r}, ${g}, ${b}`;
        ctx.fillRect(0, 0, 1280, 720);
        ctx.font = "92px Arial";
        ctx.fillStyle = "rgb(225,225,225)";
        ctx.fillText('phonecam not connected', 150, 350);
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

    setInterval(() => requestAnimationFrame(colors), 200);
    return canvas.captureStream(5);
}

/*
 * Start peer.js code
 */


let peer, peerId;


async function connectPeer() {
    // logger(`connectPeer called. peerId is ${peerId}`);
    // document.dispatchEvent(new CustomEvent('phonecam-inject', {detail: {message: 'active'}}));

    //eval(peerjs);
    if (!window.Peer) {
        // ToDo: bundle this
        await fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')
            .then(resp => resp.text())
            .then(js => eval(js))
            .catch(console.error);
    }

    if (peer){
        logger("peer already established");
        return
    }

    if (!peerId) {
        // ToDo: prevent multiple dispatches before a response
        document.dispatchEvent(new CustomEvent('phonecam-inject', {detail: {message: 'getId'}}));
        return;
    }


    /*
    peer = new window.Peer(`${peerId}-page`, {debug: 3});
    peer.on('connection', conn => conn.on('data', data => logger(`phonecam: incoming data: ${data}`)));
    peer.on('disconnected', () => logger("peer disconnected"));
    peer.on('open', id => logger(`phonecam: my peer ID is: ${id}`));

    peer.on('call', call => {
        call.on('stream', stream => {
            if (!phoneCamStream)
                phoneCamStream = window.phoneCamStream = stream;
            else if(phoneCamStream.getTracks().length > 0){
                phoneCamStream.getTracks().forEach(track=>track.stop());
                // stream.getTracks().forEach(track=>phoneCamStream.addTrack(track));
                phoneCamStream = stream;
            }

            logger(`phonecam: stream established with streamId: ${phoneCamStream.id}`);
        });

        call.answer();
    });
    */

    peer = new window.Peer(`${peerId}-page`, {debug: 3});
    peer.on('open',  id=> console.log(`My peer ID is ${id}. Waiting for call`));

    peer.on('connection', conn => {
        conn.on('data', data => console.log(`Incoming data: ${data}`))
    });
    peer.on('disconnected', ()=>console.log("Peer disconnected"));

    peer.on('call', call=>{
        call.on('stream', stream=>{
            console.log("Got stream, switching source");
            if(phoneCamStream.getTracks().length > 0){
                console.log("phoneCamStream already had tracks");
                phoneCamStream.getTracks().forEach(track=>track.stop());
                // stream.getTracks().forEach(track=>phoneCamStream.addTrack(track));
            }
            phoneCamStream = window.phoneCamStream = stream;


            // Stream on is not a function
            // stream.on('close', ()=> "Peer stream stopped");
            // stream.on('error', err=>console.error(err));

        });
        console.log("Answering incoming call");
        call.answer();
    });


}


/*
 * enumerateDevices shim
 */
const origEnumeratDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
navigator.mediaDevices.enumerateDevices = function () {
    return origEnumeratDevices().then(devices => {

            logger("phonecam added to enumerateDevices");

            // ToDo: check if there are enum permissions
            // ToDo: manage audio / video availability
            let fakeDevices = [{
                deviceId: "phonecam-video",
                kind: "videoinput",
                label: "phonecam-video",
                groupId: "phonecam"
            }, {
                deviceId: "phonecam-audio",
                kind: "audioinput",
                label: "phonecam-audio",
                groupId: "phonecam"
            }];
            fakeDevices.forEach(fakeDevice => {
                fakeDevice.__proto__ = InputDeviceInfo.prototype;
                devices.push(fakeDevice);
            });

            // ToDo: should I connect here?
            connectPeer();

            return devices
        }
        //}, err => Promise.reject(err)
    );
};


// ToDo: respond here - https://stackoverflow.com/questions/42462773/mock-navigator-mediadevices-enumeratedevices


/*
 * getUserMedia shim
 */

const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
// Finding: you can't send a stream over postMessage
navigator.mediaDevices.getUserMedia = async function (constraints) {

    logger({note: "gum requested; original constraints:", constraints});

    // Load peerJS
    // ToDo: move this to use only if phonecam is selected?
    await connectPeer();

    let swapAudio = false;
    let swapVideo = false;

    // ToDo: need to manage audio & video tracks separately, use addTracks
    if (JSON.stringify(constraints.audio).includes('phonecam')) {
        swapAudio = true;
        constraints.audio = false;
    }
    if (JSON.stringify(constraints.video).includes('phonecam')) {
        swapVideo = true;
        constraints.video = false;
    }

    if (swapAudio || swapVideo) {
        logger(`phonecam selected`);

        logger({note: "updated constraints:", constraints});

        return origGetUserMedia(constraints).then(stream => {
            // Use the standby stream is phoneCam is selected, but not active
            if (!phoneCamStream || phoneCamStream.getTracks().length === 0){
                phoneCamStream = standbyStream();
                standbyActive = true;
            }

            if (swapVideo) {
                phoneCamStream.getVideoTracks()
                    .forEach(track => stream.addTrack(track));

            }
            if (swapAudio) {
                phoneCamStream.getAudioTracks()
                    .forEach(track => stream.addTrack(track));
            }
            return stream
        }, err => Promise.reject(err))
    } else
    // ToDo: shutdown the standby stream if it is running and phonecam not selected?
        return origGetUserMedia(constraints)
};

window.addEventListener('beforeunload', () => {
//    window.removeEventListener('message', {passive: true});

    if (peer)
        peer.destroy();
    logger('beforeunload handler')

}, {passive: true});


document.addEventListener('phonecam-content', e => {
    // console.log('phonecam-content', e.detail);
    if (e.detail.peerId) {
        const newId = e.detail.peerId;
        if (peerId === newId) {
            logger("peerId hasn't changed");
            return
        }

        peerId = newId;
        logger(`set new peerId: ${newId}`);
        if (peer) {
            peer.destroy();
            peer = false;
            connectPeer();
        }
    }
});


