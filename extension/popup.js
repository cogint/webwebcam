import {VanillaQR} from "../modules/vanillaQR.mjs"


//Create qr object
//Minus the url, these are the defaults
let qr = new VanillaQR({

    //url: JSON.stringify({webwebcam: id}),
    size: 300,

    colorLight: "#ffffff",
    colorDark: "#000000",

    //output to table or canvas
    toTable: false,

    //Ecc correction level 1-4
    ecclevel: 1,

    //Use a border or not
    noBorder: false,

    //Border size to output at
    borderSize: 4

});

//Canvas or table is stored in domElement property
document.getElementById('qr').appendChild(qr.domElement);


/**
 * Main logic
 */

let button = document.getElementById('newQr');
let idText = document.getElementById('peerIdText');
let enabledCheckbox = document.getElementById('enabledCheckbox');
let qrInfo = document.getElementById('qrInfo');
let peerStatus = document.getElementById('peerStatus');
let preview = document.getElementById('preview');
let previewVideo = document.querySelector('video');

const backgroundWindow = chrome.extension.getBackgroundPage();


enabledCheckbox.checked = backgroundWindow.enabled === "enabled";
// qrInfo.hidden = !enabledCheckbox.checked;
// peerStatus.hidden = !enabledCheckbox.checked;

peerStatus.innerText = backgroundWindow.updateStatusMessage();

// Sync DOM elements with existing states
let currentState = backgroundWindow.peerState();
if(currentState === 'disconnected' || currentState === 'closed' || currentState === 'waiting'){
    qrInfo.classList.remove('d-none');
    preview.classList.add('d-none');
}
else{
    qrInfo.classList.add('d-none');
    if(currentState === 'call'){
        preview.classList.remove('d-none');
        previewVideo.srcObject = backgroundWindow.activeStream;

    }
}

// Share/assign elements to background.js context
backgroundWindow.statusMessage = peerStatus;
backgroundWindow.qrInfo = qrInfo;
backgroundWindow.preview = preview;
backgroundWindow.previewVideo = previewVideo;



// let peerId;

function updateId(){
    const id = backgroundWindow.newId();
    idText.innerText = id;
    qr.url = JSON.stringify({webwebcam: id});
    qr.init();
}

enabledCheckbox.onchange= (e)=>{
    let status = e.target.checked;
    qrInfo.hidden = !status;
    peerStatus.hidden = !enabledCheckbox.checked;
    console.log(`changed webwebcam status to: ${status ? "enabled": "disabled"}`);
    backgroundWindow.enabledChange(status ? "enabled": "disabled");
};

if(!backgroundWindow.peerId){
    console.info("No peerId found on backgroundWindow.peerId");
    updateId();
} else {
    idText.innerText = backgroundWindow.peerId;
    qr.url = JSON.stringify({webwebcam: backgroundWindow.peerId});
    qr.init();
}

button.onclick = ()=> updateId();

document.addEventListener('keydown', e=>{
    if(e.key === '.'){
        console.log(`${e.key} pressed`);
        preview.classList.toggle('d-none');
    }

    if(e.key === 's'){
        previewVideo.srcObject = backgroundWindow.standbyStream;
        console.log("set preview video to standbyStream");
    }

    if(e.key === 'r'){
        previewVideo.srcObject = backgroundWindow.remoteStream;
        console.log("set preview video to remoteStream");

    }

});
