// Manage the pop-up display
export function popupDisplayHandler(state, context = window) {
    switch (state) {
        case "disconnected":
            context.statusMessage.innerText = "Remote disconnected (connection error)";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "waiting":
            context.statusMessage.innerText = "Waiting for remote connection";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "connected":
            context.statusMessage.innerText = "Waiting for remote stream";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;
        case "closed":
            context.statusMessage.innerText = "Remote disconnected";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "call":
            context.statusMessage.innerText = "Remote stream available";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.remove('d-none');
            break;
        case "paused":
            context.statusMessage.innerText = "Remote stream paused";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;
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


export function peerState(state) {
    if (!state) {
        popupDisplayHandler(window.state);
        return window.state;
    } else if (window.state === "call" && ( state === "connected" || state === "paused")) {
        popupDisplayHandler("call");
        return "call";
    } else if (window.state === state) {
        return state
    } else {
        console.log(`Updated peerState: ${state}`);

        // ToDo: rethink tab comms
        // sendToTabs({peerState: state});
        popupDisplayHandler(state);
        window.state = state;
        return state
    }
}
