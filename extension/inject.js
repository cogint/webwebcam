'use strict';

// ToDo: turn this back into an anonymous function

let extStream = false;      // play something if no connection
let streamReady = false;          // are we connected to the phone?
let shimActive = false;         // Checks to see if shim has been loaded
let appEnabled = true;     // is phoneCam enabled? // ToDo: find an instant way to initialize this

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


    /*
     * Start peer.js code
     */


let peer = false;
let peerId;


async function connectPeer() {

    if (!window.Peer) {
        // ToDo: bundle this
        logger("loading peerjs script");

        // ToDo: there is some error here
        //await fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')

        let parcelRequire = null;

        // ToDo: pass / load the extension ID so it is updated below or inject this as a module
        await fetch('chrome-extension://cemghnpnocjajchopfooodogjcdabglm/peerjs.min.js')
            .then(resp => resp.text())
            .then(js => eval(js))
            .catch(err=>console.error("webwebcam: ", error));
    }

    if (peer) {
        logger("peer already established");
        return
    }

    // ToDo: update this - handler was removed in content.js
    if (!peerId) {
        // ToDo: prevent multiple dispatches before a response
        document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'getId'}}));
        return;
    }

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

    // ToDo: this doesn't fire
    peer.on('connection', conn => {
        conn.on('data', data => logger(`Incoming data: ${data}`));
        logger("connection:", conn);

    });

    async function handlePeerDisconnect(e) {
        streamReady = false;
        logger("peer disconnected event", e);
        peer.destroy();
        // document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'disconnected'}}));
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

            streamReady = true;
            // document.dispatchEvent(new CustomEvent('webwebcam-inject', {detail: {message: 'connected'}}));

        });

        logger("Answering incoming call", call);
        call.answer();

        call.on('close', handlePeerDisconnect);

    });

    peer.on('error', error=>console.error("webwebcam:" , error));


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
    if (hasAudio){
        let audioConstraints = JSON.stringify(constraints.audio);
        if (audioConstraints.includes('webwebcam')){
            // Check if extension stream has an audioTrack to replace; this shouldn't happen
            if(!extStream.getAudioTracks || !extStream.getAudioTracks()[0].enabled){
                logger("peer audio stream not available ");
                audioConstraints.replace("webwebcam", "default");
                constraints.audio = JSON.parse(audioConstraints);
            }
            else {
                swapAudio = true;
                constraints.audio = false
            }
        }
    }

    let swapVideo = false;
    if (hasVideo){
        let videoConstraints = JSON.stringify(constraints.video);
        // Check if extension stream has an videoTrack to replace; this shouldn't happen
        if (videoConstraints.includes('webwebcam')){
            if(!extStream.getVideoTracks || !extStream.getVideoTracks()[0].enabled){
                logger("peer video stream not available ");
                videoConstraints.replace("webwebcam", "default");
                constraints.video = JSON.parse(constraints.video);
            }
            else {
                swapVideo = true;
                constraints.video = false
            }
        }
    }


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
            await extVideoTrack.applyConstraints(videoTrackConstraints);

            let subsVideoTrack = extVideoTrack.clone();

            stream.addTrack(subsVideoTrack);
            logger(`Added video track ${subsVideoTrack.label} to stream ${stream.id}`);
        }

        return stream;

    }

    // Nothing to change - only if swapAudio & swapVideo are BOTH false (XOR)
    if (!swapAudio && swapAudio === swapVideo) {
        logger("webwebcam not selected for audio or video, so just passing this along to gUM");
        return origGetUserMedia(origConstraints)
    }

    // If there are only webwebcam sources to return
    else if ((swapAudio && !hasVideo) || (swapVideo && !hasAudio) || (swapAudio && swapVideo)) {
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

        if(!peer)
            connectPeer().catch(err=>console.error("webwebcam error:",  err));


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

    if (!peer)
        connectPeer().catch(err=>console.error("webwebcam: ", err));

    return origEnumerateDevices().then(async devices => {

                // Connect if not already connected
                // await connectPeer();

                // logger("enumerateDevices shim");

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
                        logger("fake video capabilities?");
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
                devices.push(fakeAudioDevice);


                // ToDo: should I connect here?
                // logger(`Here is where I connectPeer using ${peerId}`);
                //connectPeer();

                // This is needed for Teams
                if (!shimActive) {
                    logger("gUM not shimmed yet");
                    shimGum();
                }

                return devices
            }, err => {
                logger('enumerateDevices shim error', err);
                Promise.reject(err);
            }
        );
}
if(appEnabled)
    navigator.mediaDevices.enumerateDevices = enumDevicesShim;


window.addEventListener('beforeunload', () => {
//    window.removeEventListener('message', {passive: true});

    // https://github.com/peers/peerjs/issues/636
    if (peer){
        extStream.getTracks().forEach(track=>track.stop());

        peer.destroy();
    }
    logger('beforeunload handler')

}, {passive: true});


document.addEventListener('webwebcam-content', e => {
    logger('content.js event data', e.detail);

    if (e.detail.enabled) {
        // let setEnabled = e.detail.active === "active";
        let enabledState = e.detail.enabled;

        let currentPhonecamEnabled = appEnabled;

        appEnabled = enabledState === "enabled";

        if (currentPhonecamEnabled === appEnabled) {
            logger(`No change to enabled state. It is still ${appEnabled}`);
            return
        }

        logger(`appEnabled is now ${appEnabled}`);

        // ToDo: this disable / enable isn't working right
        // I think I need to keep shims always active for it to work

        /*
         * Disable
         */
        if (appEnabled && enabledState === "disabled") {
            logger("ending any connection and disabling shims");

            if (peer) {
                peer.destroy();
                peer = false;
            }

            appEnabled = false;


            if (standbyStream.enabled)
                standbyStream.getTracks().forEach(track => track.stop());

            // Reset gUM
            // navigator.mediaDevices.getUserMedia = origGetUserMedia;
            shimActive = false;

            // reset enumerateDevices
            // navigator.mediaDevices.enumerateDevices = origEnumerateDevices;

            logger("sent devicechange event");

            return
        }

        /*
         * Enable
         */
        if (appEnabled === false && enabledState === "enabled") {
            logger("enabling shims");
            shimGum();
            navigator.mediaDevices.enumerateDevices = enumDevicesShim;

        }

        let fakeDeviceChange = new Event("devicechange");
        navigator.mediaDevices.dispatchEvent(fakeDeviceChange);

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
