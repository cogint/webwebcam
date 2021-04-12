const backgroundWindow = chrome.extension.getBackgroundPage();

window.addEventListener('load', async ()=> {
    let video = document.querySelector('video#standby');
    video.srcObject = backgroundWindow.stream;
    console.log("set stream", backgroundWindow.stream);
});

