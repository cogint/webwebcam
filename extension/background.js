import {getStandbyStream} from "../modules/simStream.mjs";

/**
 * Content.js communication
 */
let lastActiveTabId;        // ToDo: what happens with multiple tabs?

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log(`message from tab ${sender.tab.id} on ${sender.tab.url}`, request);

        if (request.webwebcam)
            lastActiveTabId = sender.tab.id;
        else {
            console.info("received non webwebcam request", request, sender);
            return
        }


        if (request.webwebcam === "hello") {
            sendResponse({webwebcam: "ACK"}); // content.js backgroundMessageHandler throws an error without this
            console.log(`tab ${sender.tab.id} active`);
        } else if (request.webwebcam === "needData") {
            let data = {webwebcam: {active: enabled ? "active" : "inactive", peerId: peerId}};
            sendResponse(data);
            console.log("sent this to content.js", data);
        }
    });


function sendToTabs(message) {
    // This won't send anything until the tab is ready
    if (!lastActiveTabId)
        return;
    console.log(`sending this to ${lastActiveTabId}`, message);
    chrome.tabs.sendMessage(lastActiveTabId, {webwebcam: message}, null, null); //response callback removed
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

// Shared popus.js vars

/*
let statusMessage = document.createElement('span');
let qrInfo
let preview = document.createElement('div');
let previewVideo = document.createElement('video');
*/

// These should be reassigned when the pop-up opens
window.statusMessage = document.createElement('span');
window.qrInfo = document.createElement('div');
window.preview = document.createElement('div');
window.previewVideo = document.createElement('video');

statusMessage.innerText = "uninitialized";


// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(20);
    localStorage.setItem("peerId", peerId);
    chrome.storage.local.set({'webwebcamPeerId': peerId}, () => {
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
    chrome.storage.local.set({'webwebcamEnabled': state}, () => {
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
    } else if(lastState === "call" && state === "connected") {
        return "call";
    }
    else {
        console.log(`Updated peerState: ${state}`);

        // ToDo: rethink tab comms
        // sendToTabs({peerState: state});
        lastState = state;
        return state
    }
};


// Status text shown on the popup
let lastMessage = "waiting for initialization";
window.updateStatusMessage = function updateStatusMessage(message) {
    if (!message) {
        return lastMessage
    } else {

        statusMessage.innerText = message;
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
    chrome.storage.local.set({'webwebcamPeerId': peerId}, () => {
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

updateStatusMessage("remote not connected");

/**
 * peer.js setup
 */

let standbyStream = false;
let remoteStream = false;
let activeStream = new MediaStream();
window.previewVideo.srcObject = activeStream;

let peer = new Peer(`${peerId}-ext`, {debug: 0});

function handlePeerDisconnect(e) {
    // ToDo: send message to tabs
    console.log("peer disconnected from server. Attempting to reconnect", e);
    updateStatusMessage("webwebcam disconnected");
    peer.reconnect();

    window.qrInfo.classList.remove('d-none');
    window.preview.classList.add('d-none');
}


peer.on('open', async id => {
    peerState("waiting");
    console.log(`My peer ID is ${id}. Waiting for connections`);

    // I needed to put this somewhere for async
    standbyStream = await getStandbyStream();
    activeStream = standbyStream;
    window.previewVideo.srcObject = activeStream;

});

peer.on('connection', conn => {

    // console.log(`DataConnection to ${conn.peer}`);
    // ToDo: separate between remote & page for the message below - opens QR panel in popup

    conn.on('open', () => {
            console.log(`Datachannel open with ${conn.peer}`);  //${conn.id}`);
            // conn.send("hello");

            if (conn.peer === `${peerId}-remote`) {
                updateStatusMessage("webwebcam available");
                qrInfo.classList.add('d-none');

                peerState("connected");
            } else if (conn.peer === `${peerId}-page`) {

                // ToDo: this is happening more than once

                // this should always pass
                if (activeStream && activeStream.active) {
                    let call = peer.call(`${peerId}-page`, activeStream);
                    console.log(`started call to page`, call);
                }

                // console.log("initiating call to page with standbyStream", activeStream);
                // peer.call(`${peerId}-page`, activeStream);
            } else {
                console.log("unrecognized peer");

            }

        }
    );


    // This is happening twice
    conn.on('data', data => {
        console.log(`Incoming data: ${data}`);

        if (data === "call me") {
            console.log(`initiating call to ${conn.peer} with stream:`, activeStream);
            peer.call(`${conn.peer}`, activeStream);
        }

    });

    /*
    conn.on('close', () => {
        //peerState("closed");
        // console.log(`Connection from peer ${conn.peer} closed`);
        statusMessage("webwebcam disconnected");
        qrInfo.classList.remove('d-none');
        previewVideo.classList.add('d-none');

    });
     */
    conn.on('error', err => {
        console.error(`peerjs error with ${conn.peer}`, err)
    });

});

peer.on('close', () => {
    // console.log(`Connection closed`);
    peerState("closed");
    updateStatusMessage("webwebcam closed");
    window.qrInfo.classList.remove('d-none');
    window.preview.classList.add('d-none');
});

peer.on('disconnected', handlePeerDisconnect);

peer.on('call', call => {
    console.log("incoming call", call);
    call.answer();
    call.on('stream', stream => {
        // Assume call is from remote.js for now
        remoteStream = stream;
        window.activeStream = activeStream = stream;

        window.preview.classList.remove("d-none");
        window.previewVideo.srcObject = stream;

        peerState("call");
        console.log(`remote stream ${stream.id}`);
    });
});



