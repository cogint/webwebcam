// Manage the pop-up display
export function popupDisplayHandler(state, context = window) {
    switch (state) {

        // If the extension disconnects from the peerjs cloud
        case "disconnected":
            context.statusMessage.innerText = "Server connection error.\nAre you online?";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;

        // connected to peerjs, but remote hasn't connected
        case "waiting":
            context.statusMessage.innerText = "Waiting for remote connection";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;

        // when the remote peer connection is open, but before the call
        case "connected":
            context.statusMessage.innerText = "Waiting for remote stream";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;

        // There was a connection, but there was a clean close
        case "closed":
            context.statusMessage.innerText = "Remote disconnected";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;

        // call with media from remote peer
        case "call":
            context.statusMessage.innerText = "Remote stream available";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.remove('d-none');
            break;

        // call media stream is still active, but hasn't had a new frame
        case "paused":
            context.statusMessage.innerText = "Remote stream paused";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;

        // User disabled the extension inside the pop-up
        // ToDo: implement this state elsewhere
        case "disabled":
            context.statusMessage.innerText = "WebWebCam disabled. Click to enable";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;
        default:
            context.statusMessage.innerText = "Error: unhandled state";
            console.error("Uncovered state in popupDisplayHandler", state)
    }
}


if (!window.state)
    window.state = "disconnected";


export function remoteState(state) {
    if (!state) {
        popupDisplayHandler(window.state);
        return window.state;
    }
    else if (window.state === "call" &&  state === "connected" ) {
        popupDisplayHandler("call");
        return "call";
    }
    else if (window.state === state) {
        return state
    } else {
        console.log(`Updated peerState: ${state}`);

        // ToDo: rethink tab comms
        // sendToTabs({remoteState: state});
        popupDisplayHandler(state);
        window.state = state;
        return state
    }
}
