
/*
 * Self-view
 * Taken from https://github.com/webrtc/samples/blob/gh-pages/src/content/devices/input-output/js/main.js
 */

const videoSelect = document.querySelector('select#videoSource');
const selectors = [videoSelect];
const constraintInput = document.querySelector('textarea#videoConstraints');
const selfSettings = document.querySelector('textarea#selfSettings');

let selfStream;

function gotDevices(deviceInfos) {
    // Handles being called several times to update labels. Preserve values.
    const values = selectors.map(select => select.value);
    selectors.forEach(select => {
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }
    });
    for (let i = 0; i !== deviceInfos.length; ++i) {
        const deviceInfo = deviceInfos[i];
        const option = document.createElement('option');
        option.value = deviceInfo.deviceId;
        /*           if (deviceInfo.kind === 'audioinput') {
                       option.text = deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
                       audioInputSelect.appendChild(option);
                   } else if (deviceInfo.kind === 'audiooutput') {
                       option.text = deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
                       audioOutputSelect.appendChild(option);
                   } else */
        if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
            videoSelect.appendChild(option);
        } else {
            console.log('deviceInfo: ', deviceInfo);
        }
    }
    selectors.forEach((select, selectorIndex) => {
        if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
            select.value = values[selectorIndex];
        }
    });
}

function getMedia(){
    console.log("videoSelect change");
    if(selfStream)
        selfStream.getTracks().forEach(track=>track.stop);
    const videoSource = videoSelect.value;

    let constraints = {};
    constraints.video = JSON.parse(constraintInput.value) || true;
    constraints.video.deviceId = videoSource ? {exact: videoSource} : undefined;

    console.log(`set constraints to ${JSON.stringify(constraints)}`);

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream=>{
            selfStream = stream;
            document.querySelector('video#self').srcObject = stream;
            selfSettings.value = JSON.stringify(selfStream.getVideoTracks()[0].getSettings());
        })
        .catch(err=>console.error(err));
}

videoSelect.onchange = getMedia;
navigator.mediaDevices.enumerateDevices()
    .then(gotDevices)
    .then(getMedia)
    .catch(err=>console.error(err));
