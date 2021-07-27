import {getStandbyStream, stopStandbyStream} from "../modules/simStream.mjs";
import {generateId} from "../modules/generateId.mjs";
import {peerState} from "../modules/popupDisplayHandler.mjs"

// ToDo: Environment variables
const AUDIO_ENABLED = false;

let remoteCall, pageCall; // holders for call objects


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

let enabled = JSON.parse(localStorage.getItem("enabled"));
// default to on if not set
if(enabled === null){
    enabled = true;
    console.log("set storage");
    localStorage.setItem("enabled", enabled);
    chrome.storage.local.set({'webwebcamEnabled': enabled}, () => {
    });
}
console.log(`Initial load - enabled is set to ${enabled}`);
window.enabled = enabled;


// if (enabled !== undefined) {

    /*
    enabledChange(enabled).catch(err=>console.error(err));
} else {
    // Default to enabled
    enabledChange(true).catch(err=>console.error(err));
}
*/


/**
 * Shared functions with popup.js
 */

// Shared popus.js vars

// These should be reassigned when the pop-up opens
window.statusMessage = document.createElement('span');
window.qrInfo = document.createElement('div');
window.preview = document.createElement('div');
window.activeVideo = document.createElement('video');
window.previewVideo = document.createElement('video');


window.statusMessage.innerText = "initializing";


// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(14); // originally was 20
    localStorage.setItem("peerId", peerId); // localStorage for easier debugging?
    chrome.storage.local.set({'webwebcamPeerId': peerId}, () => { // chrome.storage.local for sharing with content.js
    });
    window.peerId = peerId;
    console.log(`new peerId generated: ${peerId}`);
    sendToTabs({peerId: peerId});
    return peerId
};

// Enable/disable the extension from the pop-up
window.enabledChange = async function enabledChange(state) {
    console.log(`Enabled set to ${state}`);
    localStorage.setItem("enabled", state);
    chrome.storage.local.set({'webwebcamEnabled': state}, () => {
    });
    window.enabled = state;
    sendToTabs({enabled: state});
    peerState(state ? "waiting" : "disabled");

    if(state === false) {
        await disconnectAll()
    }
};

// Update the current tab ID for comms if the popup is opened
window.popupOpen = function popupOpen() {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        console.log(`popup opened on tab ${tabs[0].id}`);
        lastActiveTabId = tabs[0].id;
    });
};

window.peerState = peerState;

if(enabled)
    peerState("waiting");
else
    peerState("disabled");


/**
 * Content.js communication
 */
let lastActiveTabId;        // ToDo: what happens with multiple tabs?

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        // ToDo: Edge doesn't have a sender.tab object

        // console.log(sender);
        // console.log(`message from tab ${sender.tab ? sender.tab.id : "undefined id"} on ${sender.tab ? sender.tab.url : "undefined url"}`, request);

        if (request.webwebcam)
            lastActiveTabId = sender.tab.id;
        else {
            console.info("received non webwebcam request", request, sender);
            return
        }

        if (request.webwebcam === "hello") {
            sendResponse({webwebcam: "ACK"}); // content.js backgroundMessageHandler throws an error without this
            // console.log(`tab ${sender.tab.id} open - ${sender.tab.url}`);
        } else if (request.webwebcam === "needData") {
            let data = {webwebcam: {active: enabled, peerId: peerId}};
            sendResponse(data);
            console.log("sent this to content.js", data);
        } else {
            console.log(`message from tab ${sender.tab ? sender.tab.id : "undefined id"} on ${sender.tab ? sender.tab.url : "undefined url"}`, request);
            // response required when content.js does `chrome.runtime.sendMessage` / sendToBackground
            sendResponse({webwebcam: "ACK"});
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
 * stream variables
 * Add to window for easier debugging
 */



window.activeStream = new MediaStream();
window.activeVideo.srcObject = window.activeStream;


async function startStandby(){
    let stream = window.standbyStream;
    console.log("No stream ready. Starting standby stream");
    if(!stream || !stream.active)
        stream = await getStandbyStream({method: "image", file: "assets/standby.png",  width: 1280, height: 720, frameRate: 5, audioEnabled: AUDIO_ENABLED});
    window.activeVideo.srcObject = stream; // update open pop-uo
    window.activeStream = stream;           // for the next time pop-up opens
    return stream;
}


// ToDo: handle user manually refreshing extension

/**
 * peer.js setup
 */


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

    if(AUDIO_ENABLED){
        // check for an audio track
        let audioSender = await pageCall.peerConnection.getSenders().find(s => {
            return s.track.kind === "audio";
        });

        // replace the audio track
        if (audioSender) {
            console.log("audioSender", audioSender);
            let newAudioTrack = stream.getAudioTracks()[0];
            await audioSender.replaceTrack(newAudioTrack);
        } else console.log(`no audioSender in pageCall: ${pageCall.connectionId}`);
    }


}

async function handlePeerDisconnect(origConn) {
    console.log(origConn);

    if(origConn.closing){
        console.log("handlePeerDisconnect - conn already closed");
        return
    }

    origConn.closing = true;


    // stop the ping server
    clearTimeout(pingTimeOut);

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

        // swap in the standby stream if the pageCall is already connected
        if (pageCall && pageCall.open){
            window.standbyStream = await startStandby();
            await replaceTracks(window.standbyStream);
        }
        peerState("closed");

    } else if (origConn.page || origConn.peer.match(/-page/) ) {
        console.log(`page peer ${origConn.type} disconnected`, origConn);
        manualClose("page");


        if (remoteCall && remoteCall.open){
            peerState("call")
        }
        else{
            console.log("page disconnected and remote call not detected - shutting down");
            peerState("closed");

        }
    } else {
        // ToDo: bug here. This goes off when the remote disconnects. `origConn` doesn't contain .remote
        console.log("unrecognized peer", origConn)
        // peerState("error");
    }

}

// Disconnect the page, remote, adn standby stream based on global objects
async function disconnectAll(){
    if(remoteCall && remoteCall.open)
        await handlePeerDisconnect(remoteCall);
    if(pageCall && pageCall.open)
        await handlePeerDisconnect(pageCall);
    if(window.standbyStream && window.standbyStream.active)
        stopStandbyStream(window.standbyStream);
}


// ToDo: make this a class and handle the page connection too

// Looks for a ping from the remote and resets a countdown timer
// if timer is is exceeded send a message to remote with one last timer before disconnecting
let pingTimeOut = false;
async function pingHandler(conn){
    conn.send("pong");
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
    peerState(enabled ? "waiting" : "disabled");
    console.log(`My peer ID is ${id}. Waiting for connections`);
});

peer.on('connection', conn => {

    console.log("connection:", conn);

    conn.on('open', async () => {
        console.log(`Datachannel open with ${conn.peer}`);  //${conn.id}`);
        // conn.send("hello");

        if (conn.peer === `${peerId}-remote`) {
            conn.remote = true;
            peerState("connected");

        }
        // Setup outgoing call

        else if (conn.peer === `${peerId}-page`) {

            // this was happening more than once - is it still?
            conn.page = true;

            /*
            if (!window.activeStream.active) {
                console.log("Active stream stopped. Switching to standby stream");
                window.activeStream = window.standbyStream;
            }
             */

            // ToDo: moved standby stream setup here - test handling

            if (!window.activeStream.active){
                console.log("About to make call and no activeStream. Starting standby..");
                await startStandby();
            }


            pageCall = peer.call(`${peerId}-page`, window.activeStream);
            console.log(`started call to page`, pageCall);
            peerState("call");


            // ToDo: handle error conditions
            pageCall.on('error', async err=>{
                console.error(err);
                await handlePeerDisconnect(pageCall);
            });


            // peerjs bug prevents this from firing: https://github.com/peers/peerjs/issues/636
            pageCall.on('close', async () => {
                console.log("pageCall close event");
                if(window.standbyStream){
                    stopStandbyStream(window.standbyStream);
                    window.standbyStream = false;
                }
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
                await pingHandler(conn);
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
                // peerState("closed");
            }
        });

        conn.on('close', async () => {
            console.log("conn close event");
            await handlePeerDisconnect(conn);
            // peerState("closed")
        });

    });


    conn.on('error', err => {
        console.error(`peerjs error with ${conn.peer}`, err)
    });

});

// This shouldn't happen
// ToDo: switch to disabled?
peer.on('close', (e) => {
    handleServerDisconnect(e);
    peerState("disconnected");
});

//
peer.on('disconnected', (e) => {
    console.log("Disconnected from signaling server");
    handleServerDisconnect(e);
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
        streamChecker();

        window.activeVideo.srcObject = stream; // pop-up

    });

    // ToDo: bug prevents this from firing
    // https://github.com/peers/peerjs/issues/636
    call.on('close', async () => {
        console.log("call close event", call);

        // await handlePeerDisconnect(rem);
        // peerState("closed");
    });

    call.answer();

});


let streamCheckTimer;
function streamChecker(){
    //console.log(previewVideo.webkitDecodedFrameCount);
    window.previewVideo.srcObject = window.activeStream;

    let newState;

    let lastCount = activeVideo.webkitDecodedFrameCount;
    if(lastCount < 1)
        peerState("paused");
    else {
        streamCheckTimer = setInterval(() => {
            // console.log(activeVideo.webkitDecodedFrameCount);

            const currentState = peerState();

            if (currentState !== "call" && currentState !== "paused") {
                console.info(`Invalid streamChecker state: ${currentState}`);
                clearInterval(streamCheckTimer);
                return
            }

            let currentCount = activeVideo.webkitDecodedFrameCount;
            if (lastCount === currentCount) {
                newState = "paused";

            } else {
                newState = "call";
            }

            if(newState !== currentState){
                peerState(newState);
                window.previewVideo.srcObject = newState === "paused" ? null : window.activeStream;

            }

            lastCount = currentCount;

        }, 500);
    }
}
