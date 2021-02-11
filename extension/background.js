console.log("background.js loaded");

chrome.runtime.onConnect.addListener( port=> {
    // Check for messages from inject.js
    port.onMessage.addListener( message => console.log([...message]));

});

chrome.runtime.onSuspend.addListener( message =>
    console.log("Extension port disconnected: " + message));

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log('Reached Background.js');
        console.log('onMessage', request, sender, sendResponse)
    });
