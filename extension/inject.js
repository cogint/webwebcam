'use strict';

// ToDo: turn this back into an anonymous function

let extStream = false;      // play something if no connection
let connected = false;          // are we connected to the phone?
let shimActive = false;         // Checks to see if shim has been loaded
let appEnabled = true;     // is phoneCam enabled? // ToDo: find an instant way to initialize this

/*
 * helper function
 */
function logger(...message) {
    /*
    document.dispatchEvent(new CustomEvent('phonecam-inject', {
        detail: {
            // sourceUrl: window.location.href,
            entity: 'inject.js',
            logger: message
        }
    }));*/
    console.log('phonecam inject: ', message.length === 1 ? message[0] : JSON.stringify(message));
}


/*
 * Start peer.js code
 */


let peer;
let peerId;


async function connectPeer() {

    if (!window.Peer) {
        // ToDo: bundle this
        logger("loading peerjs script");

        // ToDo: there is some error here
        //await fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')

        // ToDo: pass / load the extension ID so it is updated below
        await fetch('chrome-extension://cemghnpnocjajchopfooodogjcdabglm/peerjs.min.js')
            .then(resp => resp.text())
            .then(js => eval(js))
            .catch(console.error);
    }

    if (peer) {
        logger("peer already established");
        return
    }

    // ToDo: update this - handler was removed in content.js
    if (!peerId) {
        // ToDo: prevent multiple dispatches before a response
        document.dispatchEvent(new CustomEvent('phonecam-inject', {detail: {message: 'getId'}}));
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

    peer.on('connection', conn => {
        conn.on('data', data => console.log(`Incoming data: ${data}`))
    });


    async function handlePeerDisconnect(e) {
        connected = false;
        logger("peer disconnected event", e);
        // document.dispatchEvent(new CustomEvent('phonecam-inject', {detail: {message: 'disconnected'}}));
    }

    peer.on('disconnected', handlePeerDisconnect);

    peer.on('call', call => {

        call.on('stream', stream => {
            if (extStream.id === stream.id) {
                console.log("duplicate stream. (bad peerjs)", stream);
                return;
            }
            console.log("Got extStream", stream.getTracks());

            // debugVideo.srcObject = stream;

            extStream = stream;

            connected = true;
            // document.dispatchEvent(new CustomEvent('phonecam-inject', {detail: {message: 'connected'}}));

        });

        console.log("Answering incoming call", call);
        call.answer();

        // ToDo: debugging

        /*
        let debugVideo = document.createElement('video');
        debugVideo.autoplay = true;
        debugVideo.controls = true;
        debugVideo.muted = true;

        document.body.appendChild(debugVideo);
         */

        call.on('close', handlePeerDisconnect);

    });

}

// connectPeer().catch(err=>console.error(err));

// ToDo: respond here - https://stackoverflow.com/questions/42462773/mock-navigator-mediadevices-enumeratedevices


/*
 * getUserMedia shim
 */
async function shimGetUserMedia(constraints) {

    await connectPeer();

    // Keep the original constraints so we can apply them to the phonecam track later
    const origConstraints = {...constraints};
    logger("gum requested; original constraints:", origConstraints);

    let hasAudio = "audio" in constraints && constraints.audio !== false;
    let hasVideo = "video" in constraints && constraints.video !== false;

    // Check if we should override gUM with our own stream if phoneCam is requested
    let swapAudio = false;
    if (hasAudio && JSON.stringify(constraints.audio).includes('phonecam')) {
        swapAudio = true;
        constraints.audio = false;
    }

    let swapVideo = false;
    if (hasVideo && JSON.stringify(constraints.video).includes('phonecam')) {
        swapVideo = true;
        constraints.video = false;
    }

    // connect if it isn't already there
    //if (swapAudio || swapVideo)
    //await connectPeer();

    // Add extStream tracks to the supplied stream
    async function swapTracks(stream) {

        if (swapAudio) {
            let subsAudioTrack = extStream.getAudioTracks()[0].clone();

            let audioTrackConstraints = {...origConstraints.audio};
            delete audioTrackConstraints.deviceId;
            delete audioTrackConstraints.groupId;
            await subsAudioTrack.applyConstraints(audioTrackConstraints);
            stream.addTrack(subsAudioTrack);

            logger(`Added audio track ${subsAudioTrack.label} to stream ${stream.id}`);
        }

        if (swapVideo) {
            let subsVideoTrack = extStream.getVideoTracks()[0].clone();

            let videoTrackConstraints = {...origConstraints.video};
            delete videoTrackConstraints.deviceId;
            delete videoTrackConstraints.groupId;
            delete videoTrackConstraints.facingMode;
            await subsVideoTrack.applyConstraints(videoTrackConstraints);
            stream.addTrack(subsVideoTrack);
            logger(`Added video track ${subsVideoTrack.label} to stream ${stream.id}`);
        }

        return stream;

    }

    // Nothing to change - only if swapAudio & swapVideo are BOTH false (XOR)
    if (!swapAudio && swapAudio === swapVideo) {
        logger("phonecam not selected for audio or video, so just passing this along to gUM");
        return origGetUserMedia(constraints)
    }

    // If there are only phonecam sources to return
    else if ((swapAudio && !hasVideo) || (swapVideo && !hasAudio) || (swapAudio && swapVideo)) {
        return new Promise(async (resolve, reject) => {
            try {
                let stream = await swapTracks(new MediaStream());
                logger(`created a new stream with just phonecam tracks: ${stream.id}`);
                resolve(stream);
            } catch (err) {
                logger(`Failed to create phonecam stream: ${err}`);
                reject(err);
            }
        })
    }
    // if there is one phonecam source and one other source
    else if ((swapAudio && hasVideo) || (swapVideo && hasAudio)) {

        return new Promise(async (resolve, reject) => {
            try {
                let stream = await origGetUserMedia(constraints);
                stream = await swapTracks(stream);
                logger(`Added an ${swapAudio ? "video" : "audio"} track to existing stream ${stream.id}`);
                resolve(stream);
            } catch (err) {
                logger("phonecam: uncaught error", err);
                reject(err);
            }
        })
    } else {
        logger("invalid getUserMediaShim state");
        console.error("invalid getUserMediaShim state")
    }
}

const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

function shimGum() {
    if (shimActive) {
        console.log("gUM shim already active; skipping");
        return
    }

    //const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!appEnabled) {
            return origGetUserMedia(constraints)
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

//if (appEnabled)
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
        return origEnumerateDevices().then(async devices => {

                // Connect if not already connected
                await connectPeer();

                // logger("enumerateDevices shim");

                // ToDo: verify proper behavior if there are no browser permissions
                // Skip if there are no permissions
                if (devices.filter(d => d.label !== "").length === 0) {
                    return devices
                }

                let noLabel = !devices.find(d => d.label !== "");
                if (noLabel) logger("no device labels found");


                // InputDeviceInfo.prototype + getCapabilities override

                // ToDo: adjust these capabilities based on the phoneCam stream?
                let fakeVideoDevice = {
                    __proto__: InputDeviceInfo.prototype,
                    deviceId: "phonecam-video",
                    kind: "videoinput",
                    label: noLabel ? "" : "phonecam-video",
                    groupId: noLabel ? "" : "phonecam",
                    getCapabilities: () => {
                        logger("fake video capabilities?");
                        return {
                            aspectRatio: {max: 1920, min: 0.000925925925925926},
                            deviceId: noLabel ? "" : "phonecam-video",
                            facingMode: [],
                            frameRate: {max: 30, min: 1},
                            groupId: noLabel ? "" : "phonecam",
                            height: {max: 1080, min: 1},
                            resizeMode: ["none", "crop-and-scale"],
                            width: {max: 1920, min: 1}
                        };
                    },
                    toJSON: () => {
                        return {
                            __proto__: InputDeviceInfo.prototype,
                            deviceId: "phonecam-video",
                            kind: "videoinput",
                            label: noLabel ? "" : "phonecam-video",
                            groupId: noLabel ? "" : "phonecam",
                        }
                    }

                };


                let fakeAudioDevice = {
                    __proto__: InputDeviceInfo.prototype,
                    deviceId: "phonecam-audio",
                    kind: noLabel ? "" : "audioinput",
                    label: "phonecam-audio",
                    groupId: noLabel ? "" : "phonecam",
                    getCapabilities: () => {
                        logger("fake audio capabilities?");
                        return {
                            autoGainControl: [true, false],
                            channelCount: {max: 2, min: 1},
                            deviceId: noLabel ? "" : "phonecam-audio",
                            echoCancellation: [true, false],
                            groupId: noLabel ? "" : "phonecam",
                            latency: {max: 0.002902, min: 0},
                            noiseSuppression: [true, false],
                            sampleRate: {max: 48000, min: 44100},
                            sampleSize: {max: 16, min: 16}
                        }
                    },
                    toJSON: () => {
                        return {
                            __proto__: InputDeviceInfo.prototype,
                            deviceId: "phonecam-audio",
                            kind: noLabel ? "" : "audioinput",
                            label: "phonecam-audio",
                            groupId: noLabel ? "" : "phonecam",
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

navigator.mediaDevices.enumerateDevices = enumDevicesShim;


window.addEventListener('beforeunload', () => {
//    window.removeEventListener('message', {passive: true});

    if (peer)
        peer.destroy();
    logger('beforeunload handler')

}, {passive: true});


document.addEventListener('phonecam-content', e => {
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

        logger(`phonecamEnabled is now ${appEnabled}`);

        // ToDo: this disable / enable isn't working right
        // I think I need to keep shims always active for it to work

        /*
         * Disable
         */
        if (appEnabled && enabledState === "disabled") {
            logger("ending any connection and disabling shims");

            if (connected) {
                peer.destroy();
                appEnabled = false;
            }

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
            //navigator.mediaDevices.enumerateDevices = enumDevicesShim;

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
