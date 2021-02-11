const inject = '(' + function () {

        let phoneCamStream;
        let usePhoneCam = false;
        let localStreamId;

        /*
         * getUserMedia shim
         */

        if (navigator.mediaDevices.getUserMedia) {
            const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

            // Finding: you can't send a stream over postMessage
            navigator.mediaDevices.getUserMedia = function (cs) {
                return origGetUserMedia(cs).then(stream => {
                    localStreamId = stream.id;
                    console.log("phonecam: getUserMedia shimmed", stream.id);
                    window.postMessage(['phonecam', window.location.href, 'localstream', stream.id], '*');
                    console.log("phonecam: localStream:", stream);
                    return usePhoneCam ? phoneCamStream : stream;
                }, e => Promise.reject(e))
            }
        }

        /*
         * Start peer.js code
         */

        function replaceSources(){
            let videos = document.getElementsByTagName('video');
            [...videos].forEach(video=>{
                if(video.srcObject.id === localStreamId)
                    video.srcObject = phoneCamStream;
            })
        }

        fetch('https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js')
            .then(resp => resp.text())
            .then(js => {
                eval(js);
                const myId = '2ceef1a5-2145-43a6-8cba-235423af1412';
                let peer = new Peer(myId, {debug: 3});
                peer.on('connection', conn => conn.on('data', data => console.log(`phonecam: incoming data: ${data}`)));
                peer.on('disconnected', () => console.log("phonecam: peer disconnected"));
                peer.on('open', id => console.log('phonecam: my peer ID is: ' + id));

                peer.on('call', call => {
                    call.on('stream', stream => {
                        phoneCamStream = window.phoneCamStream = stream;
                        usePhoneCam = true;
                        console.log("phonecam: stream established");
                        window.postMessage(['phonecam', window.location.href, 'phoneCamStream', phoneCamStream.id], '*');
                        replaceSources();
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
    } +
    ')();';

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
