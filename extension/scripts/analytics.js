const serverURL = "wss://webrtc-observer.org/",
    serviceUUID = "390ddd1f-1d03-4f79-adc8-a174568e97ba",
    mediaUnitId = "webwebcam",
    statsVersion = "v20200114";


let observerWsEndPoint = ObserverRTC.ParserUtil.parseWsServerUrl(
    serverURL, serviceUUID, mediaUnitId, statsVersion
);

console.log("setup observerWsEndPoint", observerWsEndPoint);


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAnw4ivlq4olN9A9oCxSlBZNU6gxbuAWAo",
    authDomain: "webwebcam-prod.firebaseapp.com",
    projectId: "webwebcam-prod",
    storageBucket: "webwebcam-prod.appspot.com",
    messagingSenderId: "205038856131",
    appId: "1:205038856131:web:afa5996cb0be7d95653f76",
    measurementId: "G-0QXD1EN11S"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
firebase.analytics();
