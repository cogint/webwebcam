/*
 * Content.js communication
 */
let lastActiveTabId;    //ToDo: what happens with multiple tabs?

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log(`message from tab ${sender.tab.id} on ${sender.tab.url}`, request);

        if (request.phonecam)
            lastActiveTabId = sender.tab.id;
        else {
            console.info("received non phonecam request", request, sender);
            return
        }


        if (request.phonecam === "hello") {
            sendResponse( {phonecam: "ACK" }); // content.js backgroundMessageHandler throws an error without this
            console.log(`tab ${sender.tab.id} active`);
        } else if (request.phonecam === "needData") {
            let data = {phonecam: {active: enabled ? "active" : "inactive", peerId: peerId}};
            sendResponse(data);
            console.log("sent this to content.js", data);
        }
    });


function sendToTabs(message) {
    // This won't send anything until the tab is ready
    if (!lastActiveTabId)
        return;
    console.log(`sending this to ${lastActiveTabId}`, message);
    chrome.tabs.sendMessage(lastActiveTabId, {phonecam: message}, null, null); //response callback removed
}


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


// Make this global for the pop-up
window.newId = function newId() {
    peerId = generateId(20);
    localStorage.setItem("peerId", peerId);
    chrome.storage.local.set({'phonecamPeerId': peerId}, () => {
    });
    window.peerId = peerId;
    console.log(`new peerId generated: ${peerId}`);
    sendToTabs({peerId: peerId});
    return peerId
};

// Enable/disable the extension from the pop-up
window.enabledChange = function enabledChange(state) {
    console.log(`Enabled set to ${state}`);
    localStorage.setItem("enabled", state);
    chrome.storage.local.set({'phonecamEnabled': state}, () => {
    });
    window.enabled = state;
    sendToTabs({enabled: state});
};

// Update the current tab ID for comms if the popup is opened
window.popupOpen = function popupOpen(){
    chrome.tabs.query({active: true, currentWindow: true}, tabs=> {
        console.log(`popup opened on tab ${tabs[0].id}`);
        lastActiveTabId = tabs[0].id;
    });
};


// Establish the peerId
let peerId = localStorage.getItem("peerId");

if (peerId) {
    window.peerId = peerId;
    console.log(`peerId loaded: ${peerId}`);
    chrome.storage.local.set({'phonecamPeerId': peerId}, () => {
    });
} else {
    newId(true)
}

// Check enabled status

let enabled = localStorage.getItem("enabled");
console.log(`enabled is set to ${enabled}`);
if (enabled !== null) {
    window.enabled = enabled;
    chrome.storage.local.set({'phonecamEnabled': enabled}, () => {
    });
} else {
    // Default to enabled
    enabledChange(true, true)
}
