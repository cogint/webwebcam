// Content script

// Note: JS context not shared with page - Doesn't work: window.plogger = (msg)=>console.log(`webwebcam content.js: ${msg}`);

/*
 * Communicate with the injected content
 */

const sendToInject = message => {
    console.log("webwebcam content: sending this to inject.js", message);
    document.dispatchEvent(new CustomEvent('webwebcam-content', {detail: message}));
};

document.addEventListener('webwebcam-inject', async e => {
    if (!e.detail)
        return;

    let data = e.detail;
    console.log("webwebcam content: inject event data:", JSON.stringify(data));

    // ToDo: add handlers for connected, disconnected
    if (data.message) {
        sendToBackground(data.message)
    }

});


/*
 * Communicate with background.js
 */

function backgroundMessageHandler(message) {
    console.log("webwebcam content: background.js message", message);
    if (!message) {
        console.info("webwebcam content: missing message from background.js", message);
        return
    }
    else if (!message.webwebcam) {
        console.info("webwebcam content: Unrecognized message from background.js", message);
        return
    }


    // ToDo: rename active to enabled; use "active" for streams, "enabled" for on/off
    let data = message.webwebcam;

    if (data === "ACK")
        return;

    if (enabled !== data.enabled  || peerId !== data.peerId) {
        if (data.enabled) enabled = data.enabled;
        if (data.peerId) peerId = data.peerId;
        let injectMessage = {peerId: peerId, enabled: enabled};

        // Pass the updated info if changed in popup.js (communicated by background.js)
        if (document.readyState === "complete") {
            sendToInject(injectMessage);
        }
        // if the document isn't ready, wait for it
        else {
            document.addEventListener('DOMContentLoaded', () => {
                // console.log("DOMContentLoaded");
                sendToInject(injectMessage);
            });
        }

    }
}

function sendToBackground(message) {
    chrome.runtime.sendMessage({webwebcam: message}, backgroundMessageHandler);
}

// Get initialization data from background.js
// sendToBackground("init");

// Listen for updates from background.js
chrome.runtime.onMessage.addListener(
    (request, sender) => {
        console.log("webwebcam content: message from background.js", request, sender);
        backgroundMessageHandler(request)
    }
);


let peerId, enabled;

// Get values from local storage before injecting
chrome.storage.local.get(['webwebcamPeerId', 'webwebcamEnabled'], async result => {
    peerId = result.webwebcamPeerId || null;
    enabled = result.webwebcamEnabled || false;
    console.log(`peerId: ${peerId}, enabled: ${enabled}`);

    // https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions
    let script = document.createElement('script');
    /*
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => this.remove;
    (document.head || document.documentElement).appendChild(script);
     */


    // ToDo: this is loading twice sometimes


    await fetch(chrome.runtime.getURL('inject.js') )
        .then(resp => resp.text())
        .then(scriptText => {
            if (peerId !== null)
                scriptText = scriptText.replace("let peerId", `let peerId = "${peerId}"`);

            if (enabled !== null)
                scriptText = scriptText.replace("let appEnabled = true",
                    `let appEnabled = ${enabled === "enabled"}`);

            // console.log(scriptText);
            script.textContent = scriptText;

            script.onload = () => this.remove;
            // ToDo: add to head or body? append or prepend?
            (document.head || document.documentElement).appendChild(script);

        })
        .catch(console.error);

    if (peerId === null || enabled === null)
        sendToBackground("needData");

});

sendToBackground("hello");

console.log("webwebcam content: content.js loaded");
