// Content script

// Note: JS context not shared with page - Doesn't work: window.plogger = (msg)=>console.log(`phonecam content.js: ${msg}`);

let peerId, active;

/*
 * Communicate with the injected content
 */

const sendToInject = message => {
    console.log("phonecam content: sending this to inject.js", message);
    document.dispatchEvent(new CustomEvent('phonecam-content', {detail: message}));
};

document.addEventListener('phonecam-inject', async e => {
    if (!e.detail)
        return;

    let data = e.detail;
    console.log("phonecam content: inject event data:", JSON.stringify(data));

    // ToDo: add handlers for connected, disconnected
    if(data.message){
        sendToBackground(data.message)
    }

});


/*
 * Communicate with background.js
 */

function backgroundMessageHandler(message) {
    console.log("phonecam content: background.js message", message);
    if(!message.phonecam){
        console.info("phonecam content: Unrecognized message from background.js", message);
        return
    }

    // ToDo: rename active to enabled; use "active" for streams, "enabled" for on/off
    let data = message.phonecam;
    if(active !== data.active || peerId !== data.peerId){
        if(data.active) active = data.active;
        if(data.peerId) peerId = data.peerId;
        let injectMessage = {peerId: peerId, active: active};

        // Pass the updated info if changed in popup.js (communicated by background.js)
        if(document.readyState === "complete"){
            sendToInject(injectMessage);
        }
        // if the document isn't ready, wait for it
        else {
            document.addEventListener('DOMContentLoaded', ()=>{
                // console.log("DOMContentLoaded");
                sendToInject(injectMessage);
            });
        }

    }
}

function sendToBackground(message){
    chrome.runtime.sendMessage({phonecam: message}, backgroundMessageHandler);
}

// Get initialization data from background.js
sendToBackground("init");

// Listen for updates from background.js
chrome.runtime.onMessage.addListener(
    (request, sender) => {
        console.log("phonecam content: message from background.js", request, sender);
        backgroundMessageHandler(request)
    }
);


// https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions
let script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => this.remove;
(document.head || document.documentElement).appendChild(script);

// console.log("phonecam content: content.js loaded");
