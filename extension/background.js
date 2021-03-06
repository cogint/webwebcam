

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


chrome.runtime.onConnect.addListener( port=> {

    port.postMessage({phonecam: "background.js alive"});

    // Check for messages from inject.js
    port.onMessage.addListener( message => {
        console.log(message);
        if(message.phonecam && message.phonecam === "idRequest"){
            port.postMessage({phonecam: {newId: newId()}});
        }
    });
});

chrome.runtime.onSuspend.addListener( message =>
    console.log("Extension port disconnected: " + message));

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log('Reached Background.js');
        console.log('onMessage', request, sender, sendResponse)
    });
