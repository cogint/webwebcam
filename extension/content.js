// Content script
let port = chrome.runtime.connect();


// ToDo: this doesn't do anything
//
chrome.runtime.onMessage.addListener( (request, sender, sendResponse)=>{
    // console.log(request, sender.tab);
    if(!request.phonecam){
        console.info("phonecam: unrecognized message", request);
        return
    }

    if(request.phonecam.peerId && sender.tab === undefined){
        let peerId = request.phonecam.peerId;
        console.log(`returned peerId: ${peerId}`);
        document.dispatchEvent(new CustomEvent('phonecam-content', {detail: {peerId: peerId}}));

    }
});

// ToDo: debugging: "Uncaught Error: Extension context invalidated."
// Reinsert inject.js on disconnect?
port.onDisconnect.addListener(() => {
    // clean up when content script gets disconnected
    console.log("chrome runtime disconnected");
    window.removeEventListener('message', {passive: true});
});


// Communicate with the injected content
document.addEventListener('phonecam-inject', async e => {
    if (!e.detail)
        return;

    let data = e.detail;
    console.log("phonecam event data:", JSON.stringify(data));

    /*if(port)
        port.postMessage(data);*/

    // testing: tell background.js which tab this is
    // ToDo: remove
    if (data.message === 'active') {
        chrome.runtime.sendMessage({phonecam: {message: "active"}}, (response) => {
            console.log(`sent 'active' to background.js. Returned response:`, response)
        })
    }

    if (data.message === 'getId') {
        chrome.runtime.sendMessage({phonecam: {message: "newId"}}, (response) => {

            if (response.phonecam && response.phonecam.peerId) {
                let peerId = response.phonecam.peerId;
                console.log(`returned peerId: ${peerId}`);
                document.dispatchEvent(new CustomEvent('phonecam-content', {detail: {peerId: peerId}}));
            } else {
                console.error("No peerId found. Full response", response);
            }
        });

    }
});

/*
// Communicate with background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request) {
        console.log("background.js message:", request, sender);
        sendResponse({data: "you requested this"});
    }
});*/


// https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions
let script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => this.remove;
(document.head || document.documentElement).appendChild(script);

/*
// In case I want to use a video as a source
let video = document.createElement('video');
video.id = "standby";
video.muted = true;
video.autoplay = true;
video.playsinline = true;
video.loop = true;
video.hidden = true;
video.src = chrome.runtime.getURL('please-standby.mp4');
(document.body || document.documentElement).appendChild(video);
*/
