const bgw = chrome.extension.getBackgroundPage();

let standbyVideo = document.querySelector('video#standby');

let remoteVideo = document.querySelector('video#remote');

standbyVideo.srcObject = bgw.standbyStream;
remoteVideo.srcObject = bgw.remoteStream;

bgw.remoteStream.onaddtrack = (event) => {
    console.log(`Video track: ${event.track.label} added`);
    remoteVideo.srcObject = bgw.remoteStream;
};


bgw.peer.on('call', call => {
    console.log("incoming call", call);
    call.on('stream', stream => {
        console.log("remote stream attached", stream);
        remoteVideo.srcObject = stream;
    });
});
