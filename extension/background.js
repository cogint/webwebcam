import {getStandbyStream} from "../modules/simStream.mjs";
import {generateId} from "../modules/generateId.mjs";
import {peerState} from "../modules/popupDisplayHandler.mjs"

// ToDo: Environment variables
const AUDIO_ENABLED = false;

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
 * Shared functions with popup.js
 */

// Shared popus.js vars

// These should be reassigned when the pop-up opens
window.statusMessage = document.createElement('span');
window.qrInfo = document.createElement('div');
window.preview = document.createElement('div');
window.previewVideo = document.createElement('video');

// window.statusMessage.innerText = "uninitialized";


// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(14); // originally was 20
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

window.peerState = peerState;
window.state = "disconnected";

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

// ToDo: handle user manually refreshing extension

/**
 * peer.js setup
 */


window.activeStream = new MediaStream();
window.previewVideo.srcObject = activeStream;
let remoteCall, pageCall; // holders for call objects

let peer = new Peer(`${peerId}-ext`, {debug: 0});
// for debugging
window.peer = peer;

function handleServerDisconnect(e) {
    console.log("peer disconnected from server", e);
    peerState("disconnected");
    peer.reconnect();
}

async function replaceTracks(stream) {

    // replace the video track
    let videoSender = await pageCall.peerConnection.getSenders().find(s => {
        return s.track.kind === "video";
    });
    console.log("videoSender", videoSender);
    let newVideoTrack = stream.getVideoTracks()[0];
    await videoSender.replaceTrack(newVideoTrack);

    // replace the audio track
    let audioSender = await pageCall.peerConnection.getSenders().find(s => {
        return s.track.kind === "audio";
    });

    if (audioSender) {
        console.log("audioSender", audioSender);
        let newAudioTrack = stream.getAudioTracks()[0];
        await audioSender.replaceTrack(newAudioTrack);
    } else console.log(`no audioSender in pageCall: ${pageCall.connectionId}`);

}

async function handlePeerDisconnect(origConn) {

    function manualClose(type) {
        // close the peer connections
        for (let conns in peer.connections) {
            peer.connections[conns].forEach((conn, index, array) => {

                // Manually close the peerConnections b/c peerJs MediaConnect close not called bug: https://github.com/peers/peerjs/issues/636
                if (conn.peer.includes(type)) {
                    console.log(`closing ${conn.connectionId} peerConnection (${index + 1}/${array.length})`, conn.peerConnection);
                    conn.peerConnection.close();

                    // close it using peerjs methods
                    if (conn.close) {
                        conn.close();
                    }
                }
            });
        }
    }

    // manage the difference between a page and remote
    if (origConn.remote || origConn.peer.match(/-remote/)) {
        console.log(`remote peer ${origConn.type} disconnected`, origConn);
        manualClose("remote");
        peerState("closed");
        window.previewVideo.srcObject = standbyStream;

        // ToDo: make a function / module for this
        // swap in the standby stream if the pageCall is already connected
        if (pageCall && pageCall.open)
            await replaceTracks(standbyStream);

    } else if (origConn.page) {
        console.log(`page peer ${origConn.type} disconnected`, origConn);
        manualClose("page");
    } else {
        // ToDo: bug here. This goes off when the remote disconnects. `origConn` doesn't contain .remote
        console.log("unrecognized peer", origConn)
    }
}

// ToDo: make this a class and handle the page connection too

// Looks for a ping from the remote and resets a countdown timer
// if timer is is exceeded send a message to remote with one last timer before disconnecting
let pingTimeOut = false;
async function pingHandler(conn){
    if(pingTimeOut)
        clearTimeout(pingTimeOut);
    // wait for no ping
    pingTimeOut = setTimeout(()=>{
        console.log("ping timeout - checking connection..");
        clearTimeout(pingTimeOut);

        if(conn.open)
            conn.send("healthCheck");

        pingTimeOut = setTimeout(async()=>{
            console.log("No response from peer - disconnecting");
            await handlePeerDisconnect(conn);
        }, 5000)
    }, 5000)
}


peer.on('open', async id => {
    peerState("waiting");
    console.log(`My peer ID is ${id}. Waiting for connections`);

    // I needed to put this somewhere for async
    let stream = await getStandbyStream({method: "image", file: "assets/standby.png", audioEnabled: AUDIO_ENABLED});
    window.previewVideo.srcObject = stream; // update open pop-uo
    window.standbyStream = stream;          // for debugging
    window.activeStream = stream;           // for the next time pop-up opens

});

peer.on('connection', conn => {

    console.log("connection:", conn);

    // console.log(`DataConnection to ${conn.peer}`);
    // ToDo: separate between remote & page for the message below - opens QR panel in popup

    conn.on('open', () => {
        console.log(`Datachannel open with ${conn.peer}`);  //${conn.id}`);
        // conn.send("hello");

        if (conn.peer === `${peerId}-remote`) {
            conn.remote = true;
            peerState("connected");

        }
        // Setup outgoing call

        else if (conn.peer === `${peerId}-page`) {

            // ToDo: this is happening more than once
            conn.page = true;

            // this should always pass
            if (!window.activeStream.active) {
                console.log("Active stream stopped. Switching to standby stream");
                window.activeStream = window.standbyStream;
            }

            pageCall = peer.call(`${peerId}-page`, window.activeStream);
            console.log(`started call to page`, pageCall);

            // peerjs bug prevents this from firing: https://github.com/peers/peerjs/issues/636
            pageCall.on('close', async () => {
                console.log("call close event");
                await handlePeerDisconnect(pageCall);
            });

            /*} else {
                console.error("Page call - issue with activeStream:", window.activeStream);
            }*/
        } else {
            console.log("unrecognized peer: ", conn.peer);
        }


        conn.on('data', async data => {

            if(data === "ping"){
                pingHandler(conn);
                return
            }


            console.log(`Incoming data from ${conn.peer}: ${data}`);

            /*
            if (data === "call me") {
                console.log(`initiating call to ${conn.peer} with stream:`, activeStream);
                peer.call(`${conn.peer}`, activeStream);
            }

            */
            if (data === "bye") {
                console.log(`incoming bye event from ${conn.peer}`);
                await handlePeerDisconnect(conn);
                peerState("closed");
            }
        });

        conn.on('close', async () => {
            console.log("conn close event");
            await handlePeerDisconnect(conn);
            peerState("closed")
        });

    });


    conn.on('error', err => {
        console.error(`peerjs error with ${conn.peer}`, err)
    });

});

// This shouldn't happen
// ToDo: switch to disabled?
peer.on('close', () => {
    handleServerDisconnect();
    peerState("disconnected");
});

//
peer.on('disconnected', () => {
    console.log("Disconnected from signaling server");
    handleServerDisconnect();
    peerState("disconnected");
    peer.reconnect()
});

// Handle incoming call from remote
peer.on('call', call => {
    console.log("incoming call", call);
    remoteCall = call;

    remoteCall.on('stream', async stream => {

        if (window.activeStream.id === stream.id) {
            console.log("duplicate stream. (bad peerjs)", stream.id);
            return;
        }

        console.log(`remote stream ${stream.id}`);

        // Assume call is from remote.js for now
        window.activeStream = stream;
        window.remoteStream = stream; // for Debugging

        // swap out the standby stream if the pageCall is already connected
        if (pageCall && pageCall.open)
            await replaceTracks(stream);

        peerState("call");


        window.previewVideo.srcObject = stream; // pop-up

    });

    // ToDo: bug prevents this from firing
    // https://github.com/peers/peerjs/issues/636
    call.on('close', () => {
        console.log("call close event");
        handlePeerDisconnect(call);
        peerState("closed");
    });

    call.answer();

});
