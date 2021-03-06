// Content script
let port = chrome.runtime.connect();


// ToDo: this doesn't do anything
chrome.runtime.onConnect.addListener( port=> {

    port.postMessage({phonecam: "inject.js alive"});

    // Check for messages from inject.js
    port.onMessage.addListener( message => {
        console.log(message);
    });
});

// ToDo: debugging: "Uncaught Error: Extension context invalidated."
// Reinsert inject.js on disconnect?
port.onDisconnect.addListener( ()=> {
    // clean up when content script gets disconnected
    console.log("chrome runtime disconnected");
    window.removeEventListener('message', {passive: true});
});


window.addEventListener('message',  (event)=> {
    // if (typeof(event.data) === 'string') return;
    //if (channel == undefined || event.data[0] !== 'webrtcPresence') return;
    //else
    if (port && event.data[0] === 'phonecam')
        port.postMessage(event.data);
});


// https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions
let script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = ()=> this.remove;
(document.head || document.documentElement).appendChild(script);
