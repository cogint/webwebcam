

/**
 * Function to produce a unique id.
 * See: https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
 */

function generateId(length) {
    let result           = '';
    let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

let lastActiveTabId;    //ToDo: what happens with multiple tabs?


// Make this global for the pop-up
window.newId = function newId(){
    let peerId = generateId(20);
    localStorage.setItem("phonecam", JSON.stringify({peerId: peerId}));
    // window.phonecamBackground.peerId = peerId;
    window.peerId = peerId;
    console.log(`new peerId generated: ${peerId}`);
    return peerId
};


let settings = JSON.parse(localStorage.getItem("phonecam"));
if(settings && settings.peerId){
    let peerId = settings.peerId;
    window.peerId  = peerId;
    console.log(`peerId loaded: ${peerId}`);
} else {
    newId()
}

// To communicate with ???
chrome.runtime.onConnect.addListener(  port=> {
    port.postMessage({phonecam: "background.js alive"});
});


// Communicate with content.js
chrome.runtime.onMessage.addListener(
     (request, sender, sendResponse) => {
        console.log(`content.js message from tabId: ${sender.tab.id}`, request);
        if(request.phonecam.message === 'newId'){
            lastActiveTabId = sender.tab.id;
            sendResponse({phonecam: {peerId: window.peerId}});

        }
        /*
        else if(request.phonecam.message === 'active'){
            lastActiveTabId = sender.tab.id;
            sendResponse(`ack to tabId ${lastActiveTabId}`);
        }*/
    });

chrome.runtime.onSuspend.addListener( () =>
    console.log("Extension port disconnected"));

/*
chrome.tabs.query({active:true, currentWindow: false}, tabs=>{
    console.log(tabs);
    chrome.tabs.sendMessage(tabs[0].id, {message: "hello from background.js"}, response=>{
        console.log(response);
    })
});*/

// let tabs = chrome.tabs.connect();
// tabs.postMessage({joke: "Knock knock"});

