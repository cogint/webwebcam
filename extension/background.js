/**
 * Content.js communication
 */
let lastActiveTabId;        // ToDo: what happens with multiple tabs?

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log(`message from tab ${sender.tab.id} on ${sender.tab.url}`, request);

        if (request.phonecam)
            lastActiveTabId = sender.tab.id;
        else {
            console.info("received non phonecam request", request, sender);
            return
        }


        if (request.phonecam === "hello") {
            sendResponse({phonecam: "ACK"}); // content.js backgroundMessageHandler throws an error without this
            console.log(`tab ${sender.tab.id} active`);
        } else if (request.phonecam === "needData") {
            let data = {phonecam: {active: enabled ? "active" : "inactive", peerId: peerId}};
            sendResponse(data);
            console.log("sent this to content.js", data);
        }
    });


function sendToTabs(message) {
    // This won't send anything until the tab is ready
    if (!lastActiveTabId)
        return;
    console.log(`sending this to ${lastActiveTabId}`, message);
    chrome.tabs.sendMessage(lastActiveTabId, {phonecam: message}, null, null); //response callback removed
}


/**
 * Function to produce a unique id.
 * See: https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
 */

function generateId(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * Shared functions with popup.js
 */

// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(20);
    localStorage.setItem("peerId", peerId);
    chrome.storage.local.set({'phonecamPeerId': peerId}, () => {
    });
    window.peerId = peerId;
    console.log(`new peerId generated: ${peerId}`);
    sendToTabs({peerId: peerId});
    return peerId
};

// Enable/disable the extension from the pop-up
window.enabledChange = function enabledChange(state) {
    console.log(`Enabled set to ${state}`);
    localStorage.setItem("enabled", state);
    chrome.storage.local.set({'phonecamEnabled': state}, () => {
    });
    window.enabled = state;
    sendToTabs({enabled: state});
};

// Update the current tab ID for comms if the popup is opened
window.popupOpen = function popupOpen() {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        console.log(`popup opened on tab ${tabs[0].id}`);
        lastActiveTabId = tabs[0].id;
    });
};

let lastState = "disconnected";
window.peerState = function peerState(state) {
    if (!state) {
        return lastState;
    } else {
        console.log(`Updated peerState: ${state}`);

        // ToDo: rethink tab comms
        // sendToTabs({peerState: state});
        lastState = state;
        return (state);
    }
};


// Status text shown on the popup
let lastMessage = "waiting for initialization";
window.updateStatusMessage = function updateStatusMessage(message) {
    if (!message) {
        return lastMessage
    } else {

        if (window.statusMessage && window.statusMessage.innerText) {
            window.statusMessage.innerText = message;
        }

        lastMessage = message;
        return message
    }
};

/**
 * Initialization
 */

// Establish the peerId
let peerId = localStorage.getItem("peerId");

if (peerId) {
    window.peerId = peerId;
    console.log(`peerId loaded: ${peerId}`);
    chrome.storage.local.set({'phonecamPeerId': peerId}, () => {
    });
} else {
    newId(true)
}

// Check enabled status

let enabled = localStorage.getItem("enabled");
console.log(`enabled is set to ${enabled}`);
if (enabled !== null) {
    window.enabled = enabled;
    chrome.storage.local.set({'webwebcamEnabled': enabled}, () => {
    });
} else {
    // Default to enabled
    enabledChange(true, true)
}

updateStatusMessage("phonecam not connected");

/**
 * peer.js setup
 */

let standbyStream = false;
let peer = new Peer(`${peerId}-ext`, {debug: 0});

function handlePeerDisconnect(e) {
    // ToDo: send message to tabs
    console.log("peer disconnected from server. Attempting to reconnect", e);
    updateStatusMessage("phonecam disconnected");
    peer.reconnect();

    qrInfo.classList.remove('d-none');
    preview.classList.add('d-none');
}


peer.on('open', async id => {
    peerState("waiting");
    console.log(`My peer ID is ${id}. Waiting for connections`);

    // I needed to put this somewhere for async
    standbyStream = await getStandbyStream();

});

peer.on('connection', conn => {

    // ToDo: separate between phone & page for the message below - opens QR panel in popup
    // peerState("connected");



    conn.on('open', () => {
            console.log(`Datachannel open with ${conn.peer}`);  //${conn.id}`);
            // conn.on('data', data => console.log(`Incoming data from ${conn.peer}: ${data}`));
            // conn.send("hello");

            if(conn.peer === `${peerId}-phone`){
                updateStatusMessage("phonecam available");
                qrInfo.classList.add('d-none');
            } else if(conn.peer === `${peerId}-page`){

                if (window.stream && window.stream.active) {
                    let call = peer.call(`${peerId}-page`, window.stream);
                    console.log(`started call`, call);

                }

                console.log("initiating call to page with standbyStream", standbyStream);
                peer.call(`${peerId}-page`, standbyStream);
            }
            else {
                console.log("unrecognized peer");

            }

        }
    );



    // This is happening twice
    conn.on('data', data => {
        console.log(`Incoming data: ${data}`);

        if(data === "call me"){
            console.log("initiating call to page with standbyStream", standbyStream);
            peer.call(`${peerId}-page`, standbyStream);
        }

    })

    /*
    conn.on('close', () => {
        //peerState("closed");
        // console.log(`Connection from peer ${conn.peer} closed`);
        statusMessage("phonecam disconnected");
        qrInfo.classList.remove('d-none');
        previewVideo.classList.add('d-none');

    });

    conn.on('error', error => {console.error(`peerjs error`, error));
     */
});

peer.on('close', () => {
    // console.log(`Connection closed`);
    peerState("closed");
    updateStatusMessage("phonecam closed");
    qrInfo.classList.remove('d-none');
    preview.classList.add('d-none');
});

peer.on('disconnected', handlePeerDisconnect);

peer.on('call', call => {
    console.log("incoming call", call);
    call.answer();
    call.on('stream', stream => {
        previewVideo.srcObject = stream;
        window.stream = stream;

        preview.classList.remove("d-none");
        peerState("call");
        console.log(`stream ${stream.id} attached to pop-up preview window`);
    });
});


/**
 * image + webaudio for standby screen
 */

async function getStandbyStream(width = 1920, height = 1080, framerate = 10) {

    function videoFromImage() {

        const img = new Image();
        img.src = "assets/standby.png";

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.display = "none";

        const ctx = canvas.getContext('2d');

        // Needed otherwise the remote video never starts
        setInterval(()=>{
            ctx.drawImage(img, 0,0, width, height);
        }, 1/framerate);

        let stream = canvas.captureStream(framerate);
        console.log("image stream", stream);
        return stream

    }

    function makeFakeAudio() {
        let audioCtx = new AudioContext();
        let streamDestination = audioCtx.createMediaStreamDestination();

        //Brown noise

        let bufferSize = 2 * audioCtx.sampleRate,
            noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate),
            output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        let noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        noise.start(0);

        // https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques#adding_a_biquad_filter_to_the_mix

        let bandpass = audioCtx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1000;

        // lower the volume
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.2; // set to 0.1 or lower

        noise.connect(bandpass).connect(gainNode).connect(streamDestination);

        return streamDestination.stream;
    }


    let video = await videoFromImage();

    let videoTrack = video.getVideoTracks()[0];
    let audioTrack = makeFakeAudio().getAudioTracks()[0];

    let standbyStream = await new MediaStream([videoTrack, audioTrack]);
    console.log("created standbyStream", standbyStream.getTracks());
    return standbyStream

}


