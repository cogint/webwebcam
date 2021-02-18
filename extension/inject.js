const inject = '(' + function () {

        let phoneCamStream;
        let usePhoneCam = false;
        let localStreamId;
        let standbyStream;
        const extId = '2ceef1a5-2145-43a6-8cba-235423af1411-ext';

        /*
         * helper function
         */
        function logger(message) {
            window.postMessage(['phonecam', window.location.href, 'logger', message], '*');
            console.log(`phonecam: ${message}`);

        }

        // test for standbyStream
    /*
        standbyStream = document.getElementById('standby').captureStream();
        window.standbyStream = standbyStream;
        console.log(standbyStream);
*/
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
                    fakeDevices.forEach(fakeDevice=>{
                        fakeDevice.__proto__ = InputDeviceInfo.prototype;
                        devices.push(fakeDevice);
                    });

                    return devices
            }
                //}, err => Promise.reject(err)
            );
        };


        // https://stackoverflow.com/questions/42462773/mock-navigator-mediadevices-enumeratedevices
        /*
        navigator.mediaDevices.enumerateDevices = function () {
            return new Promise((res, rej) => {
                res([fakeDevice])
            })
        };
        */


        /*
         * getUserMedia shim
         */

        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        // Finding: you can't send a stream over postMessage
        navigator.mediaDevices.getUserMedia = function (constraints) {
            console.log("gum requested; original constraints", constraints);

            let swapAudio = false;
            let swapVideo = false;

            // ToDo: need to manage audio & video tracks separately, use addTracks
            if(JSON.stringify(constraints.audio).includes('phonecam')){
                swapAudio = true;
            }
            if(JSON.stringify(constraints.video).includes('phonecam'))
                swapVideo = true;

            if (swapAudio || swapVideo){
                console.log(`phonecam selected`);

                constraints = {
                    video: swapVideo ? false : constraints.video,
                    audio: swapAudio ? false : constraints.audio
                };

                console.log("updated constraints", constraints);

                return origGetUserMedia(constraints).then(stream=> {
                    //return usePhoneCam ? phoneCamStream : stream
                    if (swapVideo) {
                        phoneCamStream.getVideoTracks()
                            .forEach(track => stream.addTrack(track));

                    }
                    if (swapAudio) {
                        phoneCamStream.getAudioTracks()
                            .forEach(track => stream.addTrack(track));

                    }
                    return stream
                }, err=> Promise.reject(err))
            } else
                return origGetUserMedia(constraints)
        };

        // shim addTrack
        //   localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));


        /*
         * Start peer.js code
         */

        function replaceSources() {
            let videos = document.getElementsByTagName('video');
            [...videos].forEach(video => {
                if (video.srcObject.id === localStreamId)
                    video.srcObject = phoneCamStream;
            })
        }

        // ToDo: make this part of a build pack
        fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')
            .then(resp => resp.text())
            .then(js => {
                eval(js);
                let peer = new Peer(extId, {debug: 3});
                peer.on('connection', conn => conn.on('data', data => logger(`phonecam: incoming data: ${data}`)));
                peer.on('disconnected', () => logger("peer disconnected"));
                peer.on('open', id => logger(`phonecam: my peer ID is: ${id}`));

                peer.on('call', call => {
                    call.on('stream', stream => {
                        phoneCamStream = window.phoneCamStream = stream;
                        usePhoneCam = true;
                        logger("phonecam: stream established");
                        window.postMessage(['phonecam', window.location.href, 'phoneCamStream', phoneCamStream.id], '*');
                        //replaceSources();
                    });

                    call.answer();
                });

            })
            .catch(console.error);

        window.addEventListener('beforeunload', () => {
            console.log('phonecam: Before unload handler');
            window.removeEventListener('message', {passive: true});

            if (streams.length > 0)
                window.postMessage(['webrtcPresence', window.location.href, 'beforeunload'], '*');

        }, {passive: true})
    }
    + ')();';

let channel = chrome.runtime.connect();


// ToDo: debugging: "Uncaught Error: Extension context invalidated."
// Reinsert inject.js on disconnect?
channel.onDisconnect.addListener(function () {
    // clean up when content script gets disconnected
    console.log("chrome runtime disconnected");
    window.removeEventListener('message', {passive: true});
});


window.addEventListener('message', function (event) {
    // if (typeof(event.data) === 'string') return;
    //if (channel == undefined || event.data[0] !== 'webrtcPresence') return;
    //else
    if (channel && event.data[0] === 'phonecam')
        channel.postMessage(event.data);
});



let script = document.createElement('script');
script.textContent = inject;
(document.head || document.documentElement).appendChild(script);
script.parentNode.removeChild(script);


/*

document.addEventListener("DOMContentLoaded", function() {
    let standbyVideo = document.createElement('video');
    standbyVideo.id="standby";
    //standbyVideo.hidden = true;
    standbyVideo.muted = true;
    standbyVideo.playsinline = true;
    standbyVideo.loop = true;
    // Neither of these work - unsupported source; looks to be due to permissions
    //standbyVideo.src = "https://9e114cef54c9.ngrok.io/assets/please-standby.mp4";
    standbyVideo.src = chrome.runtime.getURL("assets/please-standby.mp4");
    standbyVideo.play();
    document.body.appendChild(standbyVideo);
});

*/
/*
 * Setup standby video
 */

/*
let sourceVideo = document.createElement('video');
//sourceVideo.src ="https://storage.googleapis.com/webrtchacks-phonecam-7767ef/fallout-standby.mp4";
sourceVideo.src = chrome.runtime.getURL("assets/please-standby.mp4");
sourceVideo.muted = true;
sourceVideo.playsinline = true;
sourceVideo.loop = true;
sourceVideo.play();
window.standbyStream = sourceVideo.captureStream();

sourceVideo.addEventListener('playing', () => {
    console.log(sourceVideo);
    console.log("pre-inject: ", window.standbyStream);
});
*/
