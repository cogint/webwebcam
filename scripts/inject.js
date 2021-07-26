// Inserted by webwwebcam browser extension. See webwebcam.com for details.
'use strict';

// ToDo: turn this back into an anonymous function

let extStream = false;      // holder for the extension stream
let shimActive = false;     // Checks to see if shim has been loaded
let appEnabled = false;      // is phoneCam enabled?


const EXTENSION_ID = null;
const AUDIO_ENABLED = false;
const STREAM_WAIT_TIME = 2500;  // How long to wait for the stream to start if not active before connection error


/*
 * helper function
 */


function logger(...message) {
    /*
    document.dispatchEvent(new CustomEvent('webwebcam-inject', {
        detail: {
            // sourceUrl: window.location.href,
            entity: 'inject.js',
            logger: message
        }
    }));*/
    //console.log('webwebcam inject: ', message.length === 1 ? message[0] : JSON.stringify(message));

    const len = message.length;
    if (len === 1)
        console.debug('webwebcam inject: ', message[0]);
    else if (len === 2)
        console.debug('webwebcam inject: ', message[0], message[1]);
    else
        console.debug('webwebcam inject: ', JSON.stringify(message.flat()));
}

function extlog(message){
    document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: message}}));
}


/*
 * Start peer.js code
 */


let peer = false;
let peerId;


function disconnect() {
    // document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'disconnected'}}));

    logger("disconnecting from peer..");
    peer.destroy();
    peer = false;
    if (extStream) {
        extStream.getTracks().forEach(track => track.stop());
        extStream = false;
    }

}

async function getPeerJs() {
    // ToDo: bundle this
    logger("loading peerjs script");

    //await fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')

    let parcelRequire = null;

    // ToDo: pass / load the extension ID so it is updated below or inject this as a module
    await fetch(`chrome-extension://${EXTENSION_ID}/scripts/peerjs.min.js`)
        .then(resp => resp.text())
        .then(js => {
            eval(js);
            logger("peerjs loaded");
        })
        .catch(err => console.error("webwebcam: ", err));
}

async function connectPeer() {

    if (!window.Peer) {
        await getPeerJs();
    }

    if (peer) {
        logger("peer already established");
        return
    }

    /*
    if (!peerId) {
        document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'getId'}}));
        return;
    }
    */

    // ToDo: change this to tabId for multi-tag
    peer = new window.Peer(`${peerId}-page`, {debug: 2});
    peer.on('open', id => {
        logger(`My peer ID is ${id}. Waiting for incoming call from ext`);

        let conn = peer.connect(`${peerId}-ext`);

        conn.on('open', () => {
            logger("connected to ext");
            // conn.send("call me");
        })
    });


    /*
    // this doesn't fire
    peer.on('connection', conn => {
        conn.on('data', data => logger(`Incoming data: ${data}`));
        logger("connection:", conn);

    });
     */

    async function handlePeerDisconnect(e) {
        logger("peer disconnected event", e);
        disconnect();
    }

    peer.on('disconnected', handlePeerDisconnect);

    peer.on('call', call => {
        // ToDo: peerJs is showing multiple calls here with the same stream


        call.on('stream', stream => {
            if (extStream.id === stream.id) {
                logger("duplicate stream. (bad peerjs)", stream);
                return;
            }
            logger("Got extStream", stream.getTracks());

            // debugVideo.srcObject = stream;

            extStream = stream;

            // document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'connected'}}));

        });

        logger("Answering incoming call", call);
        call.answer();

        call.on('close', handlePeerDisconnect);

    });

    peer.on('error', error => console.error("webwebcam:", error));


}

// uncomment to run this on every tab; currently causes issue since only one tab at a time supported
// if(appEnabled)
//    connectPeer().catch(err=>console.error(err));


/*
 * getUserMedia shim
 */
async function shimGetUserMedia(constraints) {

    // Keep the original constraints so we can apply them to the webwebcam track later
    const origConstraints = {...constraints};
    logger("gum requested; original constraints:", origConstraints);

    let hasAudio = "audio" in constraints && constraints.audio !== false;
    let hasVideo = "video" in constraints && constraints.video !== false;

    // Check if we should override gUM with our own stream if webwebcam is requested
    let swapAudio = false;
    if (hasAudio && AUDIO_ENABLED) {
        let audioConstraints = JSON.stringify(constraints.audio);
        if (audioConstraints.includes('webwebcam')) {
            swapAudio = true;
            constraints.audio = false
        }
    }

    let swapVideo = false;
    if (hasVideo) {

        let videoConstraints = JSON.stringify(constraints.video);

        // Check if extension stream has an videoTrack to replace; this shouldn't happen
        if (videoConstraints.includes('webwebcam')) {
            swapVideo = true;
            constraints.video = false
        }
    }

    // Nothing to change - only if swapAudio & swapVideo are BOTH false (XOR)
    if (!swapAudio && swapAudio === swapVideo) {
        logger("webwebcam not selected for audio or video, so just passing this along to gUM");
        // extStream not active so destroy the peer
        if (extStream && !extStream.enabled) {
            disconnect()
        }

        return origGetUserMedia(origConstraints)
    }

    extlog("webwebcam in getUserMedia");

    // Add extStream tracks to the supplied stream
    async function swapTracks(stream) {

        if (swapAudio) {
            let extAudioTrack = extStream.getAudioTracks()[0];

            let audioTrackConstraints = {...origConstraints.audio};
            delete audioTrackConstraints.deviceId;
            delete audioTrackConstraints.groupId;
            await extAudioTrack.applyConstraints(audioTrackConstraints);

            let subsAudioTrack = extAudioTrack.clone();
            stream.addTrack(subsAudioTrack);

            logger(`Added audio track ${subsAudioTrack.label} to stream ${stream.id}`);
        }

        if (swapVideo) {
            // Learning: cloning a pc stream removes the ability to apply constraints to it
            // ToDo: test this theory
            let extVideoTrack = extStream.getVideoTracks()[0];

            let videoTrackConstraints = {...origConstraints.video};
            delete videoTrackConstraints.deviceId;
            delete videoTrackConstraints.groupId;
            delete videoTrackConstraints.facingMode;

            logger("video track before", extVideoTrack.getSettings());
            logger("constraints to apply", videoTrackConstraints);
            await extVideoTrack.applyConstraints(videoTrackConstraints);
            logger("video track after", extVideoTrack.getSettings());

            let subsVideoTrack = extVideoTrack.clone();

            stream.addTrack(subsVideoTrack);
            logger(`Added video track ${subsVideoTrack.label} to stream ${stream.id}`);
        }

        return stream;

    }

    // Setup the connection and extStream
    if (!peer)
        connectPeer().catch(err => console.error("webwebcam error:", err));

    // extStream needs to be established by here.
    // check to make sure it is there, if not give it some time before continuing or error out
    // ToDo: change this to a polling algorithm
    // could also push this into swapTracks since there will be a gUM delay on a real device
    if (!extStream) {
        logger("extStream not established... pausing");
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                if (extStream)
                    resolve();
                else {
                    const err = new Error("webwebcam extension stream not available");
                    reject(err);
                }
            }, STREAM_WAIT_TIME)
        });

    }

    // ToDo: check to make sure extStream resolution has ramped before proceeding?
    // old meet.jiti.si causing problems here


    // If there are only webwebcam sources to return
    if ((swapAudio && !hasVideo) || (swapVideo && !hasAudio) || (swapAudio && swapVideo)) {
        return new Promise(async (resolve, reject) => {
            try {
                let stream = await swapTracks(new MediaStream());
                logger(`created a new stream with just webwebcam tracks: ${stream.id}`);
                resolve(stream);
            } catch (err) {
                logger(`Failed to create webwebcam stream:`, err);
                reject(err);
            }
        })
    }
    // if there is one webwebcam source and one other source
    else if ((swapAudio && hasVideo) || (swapVideo && hasAudio)) {

        return new Promise(async (resolve, reject) => {
            try {
                let stream = await origGetUserMedia(constraints);
                stream = await swapTracks(stream);
                logger(`Added an ${swapAudio ? "video" : "audio"} track to existing stream ${stream.id}`);
                resolve(stream);
            } catch (err) {
                logger("webwebcam: uncaught error", err);
                reject(err);
            }
        })
    } else {
        logger("invalid getUserMediaShim state");
        console.error("webwebcam: invalid getUserMediaShim state")
    }
}

const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

// Shim handler
function shimGum() {
    if (shimActive) {
        logger("gUM shim already active; skipping");
        return
    }

    //const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!appEnabled) {
            return origGetUserMedia(constraints)
        }

        /*
        if (!peer)
            connectPeer().catch(err => console.error("webwebcam error:", err));

         */

        // if gUM is called then load PeerJS since it may be needed
        if (!window.Peer) {
            await getPeerJs();
        }

        logger("------------------------------------------");
        logger("navigator.mediaDevices.getUserMedia called");
        let stream = await shimGetUserMedia(constraints);
        shimActive = true;
        return stream;
    };

    let _webkitGetUserMedia = async function (constraints, onSuccess, onError) {
        if (!appEnabled) {
            return _webkitGetUserMedia(constraints, onSuccess, onError)
        }

        logger("navigator.webkitUserMedia called");
        try {
            let stream = await shimGetUserMedia(constraints);
            logger("navigator.webkitUserMedia called");
            shimActive = true;
            return onSuccess(stream)
        } catch (err) {
            logger("_webkitGetUserMedia error!:", err);
            return onError(err);
        }
    };

    navigator.webkitUserMedia = _webkitGetUserMedia;
    navigator.getUserMedia = _webkitGetUserMedia;

}

if (appEnabled)
    shimGum();

// Finding: you can't send a stream over postMessage


/*
 * enumerateDevices shim
 */
const origEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

function enumDevicesShim() {
    // logger("navigator.mediaDevices.enumerateDevices called");
    if (!appEnabled) {
        return origEnumerateDevices()
    } else

    /*
    if (!peer)
        connectPeer().catch(err=>console.error("webwebcam: ", err));

     */

        return origEnumerateDevices().then(async devices => {

                // Connect if not already connected
                // await connectPeer();

                // logger("enumerateDevices shim");
                extlog("enumerateDevices shim");

                // ToDo: verify proper behavior if there are no browser permissions
                // Skip if there are no permissions
                if (devices.filter(d => d.label !== "").length === 0) {
                    return devices
                }

                let noLabel = !devices.find(d => d.label !== "");
                if (noLabel) logger("no device labels found");


                // InputDeviceInfo.prototype + getCapabilities override

                // ToDo: adjust these capabilities based on the webwebcam stream?
                let fakeVideoDevice = {
                    __proto__: InputDeviceInfo.prototype,
                    deviceId: "webwebcam-video",
                    kind: "videoinput",
                    label: noLabel ? "" : "webwebcam-video",
                    groupId: noLabel ? "" : "webwebcam",
                    getCapabilities: () => {
                        logger("fake video capabilities");
                        return {
                            aspectRatio: {max: 1920, min: 0.000925925925925926},
                            deviceId: noLabel ? "" : "webwebcam-video",
                            facingMode: [],
                            frameRate: {max: 30, min: 1},
                            groupId: noLabel ? "" : "webwebcam",
                            height: {max: 1080, min: 1},
                            resizeMode: ["none", "crop-and-scale"],
                            width: {max: 1920, min: 1}
                        };
                    },
                    toJSON: () => {
                        return {
                            __proto__: InputDeviceInfo.prototype,
                            deviceId: "webwebcam-video",
                            kind: "videoinput",
                            label: noLabel ? "" : "webwebcam-video",
                            groupId: noLabel ? "" : "webwebcam",
                        }
                    }

                };


                let fakeAudioDevice = {
                    __proto__: InputDeviceInfo.prototype,
                    deviceId: "webwebcam-audio",
                    kind: noLabel ? "" : "audioinput",
                    label: "webwebcam-audio",
                    groupId: noLabel ? "" : "webwebcam",
                    getCapabilities: () => {
                        logger("fake audio capabilities?");
                        return {
                            autoGainControl: [true, false],
                            channelCount: {max: 2, min: 1},
                            deviceId: noLabel ? "" : "webwebcam-audio",
                            echoCancellation: [true, false],
                            groupId: noLabel ? "" : "webwebcam",
                            latency: {max: 0.002902, min: 0},
                            noiseSuppression: [true, false],
                            sampleRate: {max: 48000, min: 44100},
                            sampleSize: {max: 16, min: 16}
                        }
                    },
                    toJSON: () => {
                        return {
                            __proto__: InputDeviceInfo.prototype,
                            deviceId: "webwebcam-audio",
                            kind: noLabel ? "" : "audioinput",
                            label: "webwebcam-audio",
                            groupId: noLabel ? "" : "webwebcam",
                        }
                    }
                };


                devices.push(fakeVideoDevice);
                if (AUDIO_ENABLED)
                    devices.push(fakeAudioDevice);

                // This is needed for Teams
                if (!shimActive) {
                    logger("gUM not shimmed yet. Shimming it now");
                    shimGum();
                }

                return devices
            }, err => {
                logger('enumerateDevices shim error', err);
                Promise.reject(err);
            }
        );
}

if (appEnabled)
    navigator.mediaDevices.enumerateDevices = enumDevicesShim;


/*
//for debugging
const origOnDeviceChange = navigator.mediaDevices.ondevicechange;

function deviceChangeShim(event){
    logger("devicechange event", event);
    return origOnDeviceChange
}
navigator.mediaDevices.ondevicechange = deviceChangeShim;
 */


window.addEventListener('beforeunload', () => {
//    window.removeEventListener('message', {passive: true});

    // https://github.com/peers/peerjs/issues/636
    if (peer) {
        extStream.getTracks().forEach(track => track.stop());

        peer.destroy();
    }
    logger('beforeunload handler')

}, {passive: true});

// ToDo: this disable / enable isn't working right
// Change enabledState to a boolean
// Old comment: I think I need to keep shims always active for it to work

document.addEventListener('webwebcam-content', e => {
    logger('content.js event data', e.detail);

    if (e.detail.enabled !== undefined) {
        // let setEnabled = e.detail.active === "active";
        let newEnabledState = e.detail.enabled;

        if (newEnabledState === appEnabled) {
            logger(`No change to enabled state. It is still ${appEnabled}`);
            return
        }

        appEnabled = newEnabledState;
        logger(`appEnabled is now ${appEnabled}`);


        /*
         * Disable
         */
        if (appEnabled === false) {
            logger("ending any connection and disabling shims");

            if (peer) {
                disconnect();
            }

            /*
            if (extStream.enabled){

                extStream.getTracks().forEach(track => track.stop());
                extStream = false;

            }
             */

            // Reset gUM
            shimActive = false;
            navigator.mediaDevices.getUserMedia = origGetUserMedia;

            // reset enumerateDevices
            navigator.mediaDevices.enumerateDevices = origEnumerateDevices;


            navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
            logger("devicechange event dispatched to remove webwebcam");

            return
        }
        /*
         * Enable
         */
        else if(appEnabled === true){

            logger("enabling shims");
            shimGum();
            navigator.mediaDevices.enumerateDevices = enumDevicesShim;

            // let fakeDeviceChange =;
            navigator.mediaDevices.dispatchEvent( new Event("devicechange") );
            logger("devicechange event dispatched to add webwebcam");
        }
        else{
            logger("ERROR: invalid enabled state: ", appEnabled );
        }

    }


    if (e.detail.peerId) {
        const newId = e.detail.peerId;
        if (peerId === newId) {
            logger("peerId hasn't changed");
        } else {
            peerId = newId;
            logger(`set new peerId: ${newId}`);
            if (peer) {
                peer.destroy();
                peer = false;
                connectPeer();
            }
        }
    }
});
