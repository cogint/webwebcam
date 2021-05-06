

// Manage the pop-up display
export function popupDisplayHandler(state, context=window){
    switch (state){
        case "disconnected":
            context.statusMessage.innerText = "Remote disconnected (connection error)";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "waiting":
            context.statusMessage.innerText = "Waiting for Remote connection";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "connected":
            context.statusMessage.innerText = "Waiting for Remote stream";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.add('d-none');
            break;
        case "closed":
            context.statusMessage.innerText = "remote disconnected";
            context.qrInfo.classList.remove('d-none');
            context.preview.classList.add('d-none');
            break;
        case "call":
            context.statusMessage.innerText = "remote stream available";
            context.qrInfo.classList.add('d-none');
            context.preview.classList.remove('d-none');
            break;
        default:
            context.statusMessage.innerText = "Error: unhandled state";
            console.error("uncovered state in popupDisplayHandler", state)
    }
}


if(!window.state)
    window.state = "disconnected";


export function peerState(state) {
    if (!state) {
        popupDisplayHandler(window.state);
        return window.state;
    } else if (window.state === "call" && state === "connected") {
        popupDisplayHandler("call");
        return "call";
    } else {
        console.log(`Updated peerState: ${state}`);

        // ToDo: rethink tab comms
        // sendToTabs({peerState: state});
        popupDisplayHandler(state);
        window.state = state;
        return state
    }
}
