import {VanillaQR} from "../modules/vanillaQR.mjs"
import {popupDisplayHandler} from "../modules/popupDisplayHandler.mjs"

// ToDo: build variables
const ROOT_URL = "https://webweb.cam?i=";


/**
 * QR Code
 */
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

// ToDo: redo in jquery
let button = document.getElementById('newQr');
let idText = document.getElementById('peerIdText');

let enabledCheckbox = document.getElementById('enabledCheckbox');
let qrInfo = document.getElementById('qrInfo');
let peerStatus = document.getElementById('peerStatus');
let preview = document.getElementById('preview');
let previewVideo = document.querySelector('video');

const backgroundWindow = chrome.extension.getBackgroundPage();

enabledCheckbox.checked = backgroundWindow.enabled;
qrInfo.hidden = !enabledCheckbox.checked;

// Share/assign elements to background.js context
backgroundWindow.statusMessage = peerStatus;
backgroundWindow.qrInfo = qrInfo;
backgroundWindow.preview = preview;
backgroundWindow.previewVideo = previewVideo;

console.log(`state: ${backgroundWindow.state}`);

// Sync DOM elements with existing states
popupDisplayHandler(backgroundWindow.state, backgroundWindow);

function updateId(generate = true){
    const id = generate ?  backgroundWindow.newId() : backgroundWindow.peerId;
    const fullUrl = ROOT_URL + id;
    idText.innerText = fullUrl;
    qr.url = fullUrl;  // qr.url = JSON.stringify({webwebcam: id});
    qr.init();
}

enabledCheckbox.onchange= (e)=>{
    let status = e.target.checked;
    qrInfo.hidden = !status;
    peerStatus.hidden = !enabledCheckbox.checked;
    console.log(`changed webwebcam status to: ${status}`);
    backgroundWindow.enabledChange(status);
};

if(!backgroundWindow.peerId){
    console.info("No peerId found on backgroundWindow.peerId");
    updateId(true);
} else {
    updateId(false);
    /*
    idText.innerText = backgroundWindow.peerId;
    // qr.url = JSON.stringify({webwebcam: backgroundWindow.peerId});
    qr.init();
     */
}

button.onclick = ()=> updateId();

/*
copyLink.onclick = async () => {
    await navigator.clipboard.writeText(ROOT_URL + backgroundWindow.peerId);
    console.log(ROOT_URL + backgroundWindow.peerId);
};
*/


// Key handler to help with debugging
document.addEventListener('keydown', e=>{
    if(e.key === '.'){
        console.log(`${e.key} pressed`);
        preview.classList.toggle('d-none');
    }

    if(e.key === 's'){
        activeVideo.srcObject = backgroundWindow.standbyStream;
        console.log("set preview video to standbyStream");
    }

    if(e.key === 'r'){
        activeVideo.srcObject = backgroundWindow.remoteStream;
        console.log("set preview video to remoteStream");

    }

});

/*
if(backgroundWindow.state !== "paused"){
    previewVideo.autoplay = true;
    previewVideo.srcObject = backgroundWindow.activeStream;
}

*/


/**
 * Bootstrap
 */
$(function () {
    //$('[data-toggle="popover"]').popover();
});

$('[data-toggle="tooltip"]').tooltip();


$('.js-copy').click(async(e)=> {
    console.log(e.target);
    let copyLink = $('#copyLink'); //$(this); // Not sure why # $(this) didn't work
    // let copyLink = e.target;
    await navigator.clipboard.writeText(ROOT_URL + backgroundWindow.peerId);
    let elOriginalText = copyLink.attr('data-original-title');
    copyLink.attr('data-original-title', "Copied!").tooltip('show');
    console.log(ROOT_URL + backgroundWindow.peerId);
    copyLink.attr('data-original-title', elOriginalText);

    // Attempts to set hide delay via toggle options didn't work
    setTimeout(()=>{
        copyLink.tooltip('hide');
    }, 2000)
});
