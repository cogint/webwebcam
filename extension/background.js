/**
 * Function to produce a unique id.
 * See: https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
 */

function generateId(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

let lastActiveTabId;    //ToDo: what happens with multiple tabs?
let peerId;             // keep global for debugging

// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(20);
    localStorage.setItem("peerId", peerId);
    window.peerId = peerId;
    console.log(`new peerId generated: ${peerId}`);
    sendToTabs({peerId: peerId});
    return peerId
};

window.enabledChange = function enabledChange(state) {
    console.log(`Enabled set to ${state}`);
    localStorage.setItem("enabled", state);
    enabled = state;
    window.enabled = state;
    sendToTabs({active:  state ? "active" : "inactive"});
};

// Establish the peerId
peerId = localStorage.getItem("peerId");
if (peerId) {
    window.peerId = peerId;
    console.log(`peerId loaded: ${peerId}`);
} else {
    newId()
}

// Establish enabled setting
let enabled = JSON.parse(localStorage.getItem("enabled"));
if (enabled) {
    window.enabled = enabled;
    console.log(`phonecam enabled: ${enabled}`);
} else {
    // default to enabled
    enabledChange(true);
}


/*
 * Content.js communication
 */

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(`message from tab ${sender.tab.id} on ${sender.tab.url}`, request);
        if(request.phonecam && request.phonecam==="init"){
            lastActiveTabId = sender.tab.id;
            let data = {phonecam: {active: enabled ? "active" : "inactive", peerId: peerId}};
            sendResponse(data);
            console.log("sent this to content.js", data);
        }
    });


function sendToTabs(message){
    console.log(`sending this to ${lastActiveTabId}`, message);
    chrome.tabs.sendMessage(lastActiveTabId, {phonecam: message}, null, null); //response callback removed
}
