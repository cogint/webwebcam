

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

let peerId;
let lastActiveTabId;    //ToDo: what happens with multiple tabs?

function newId(){
    peerId = generateId(20);
    localStorage.setItem("phonecam", JSON.stringify({peerId: peerId}));
    console.log(`new peerId generated: ${peerId}`);
    return peerId
}

let settings = JSON.parse(localStorage.getItem("phonecam"));
if(settings && settings.peerId){
    peerId = settings.peerId;
    console.log(`peerId loaded: ${peerId}`);
} else {

}


// To communicate with popup.js
chrome.runtime.onConnect.addListener(  port=> {

    port.postMessage({phonecam: "background.js alive"});

    // Check for messages from popup.js
    port.onMessage.addListener( async message => {
        console.log("popup.js message", message);
        if(message.phonecam && message.phonecam === "idRequest"){
            newId();
            // send the new ID to popup.js
            port.postMessage({phonecam: {newId: peerId}});
            // send the new ID to the last tab
            chrome.tabs.sendMessage(lastActiveTabId, {phonecam: {peerId: peerId}});
        }

        if(message.phonecam && message.phonecam.enabled){
            chrome.tabs.sendMessage(lastActiveTabId, {phonecam: message.phonecam.enabled});
        }

        });
});

// Communicate with content.js
chrome.runtime.onMessage.addListener(
     (request, sender, sendResponse) => {
        console.log(`content.js message from tabId: ${sender.tab.id}`, request);
        if(request.phonecam.message === 'newId'){
            lastActiveTabId = sender.tab.id;
            sendResponse({phonecam: {peerId: peerId}});

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

