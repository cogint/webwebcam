## Introduction

WebWebCam is a Chrome Extension for using a remote web cam as a virtual camera device 
in the browser using [WebRTC](https://en.wikipedia.org/wiki/WebRTC). 
Unlike other virtual camera options, WebWebCam requires no operating system-level installs - 
just the extension - and is easy to turn on/off when it is needed.
WebWebCam is also completely wireless. All media is peer-to-peer, end-to-end encrypted.

WebWebCam is useful for:
- Using your mobile phone as a high-quality webcam - your mobile phone probably has better quality than your laptop's webcam
- Adding a different camera feed in your meetings app without having to join multiple times - 
i.e. use your mobile to show a whiteboard without having to awkwardly position your laptop
- Using a microphone connected to your phone or other computer without having to configure it on the computer you use for meetings 



WebWebCam is very much a work-in-progress.

## Installation

Current installation requires side-loading from [chrome://extensions](chrome://extensions) in developer mode.
We hope to submit it to the Chrome Web App store soon.


## How to use it 

1. Sideload the extension in [chrome://extensions](chrome://extensions) 
1. If you click the extension pop-up window next to the browser bar you will see a QR code. 
1. Use your mobile phone to scan this QR code and open that web page
1. Once scanned, that web page will automatically connect to your browser. 
Make sure to accept permissions. 
You can see the preview in the extension pop-up window.
1. Go to the web version of your favorite meetings app - i.e. make sure to click join from this browser instead of from the Zoom / Teams app
1. Change the camera and/or microphone in your meetings app to "webwebcam" - you'll see/hear the remote feed


Alternatively you can copy the unique URL shown in the pop-up to the remote browser of your choice to use that as a webcam.
If the remote feed is unavailable then WebWebCam will show a standby screen.

Disable WebWebCam from the extension pop-up if you want to turn it off.


## Known limitations

* The extension only works with Chrome so make your Zoom/Teams/Meet/Duo/Jitsi/etc. calls there; 
the remote should work with any browser that has access to a webcam
* Video only - I had some bugs with audio and will be adding that back soon
* Only one tab can use the `webwebcam-video` source at a time
* The remote UI needs some work - you may need to press twice to change the video source


## Thanks
* This project uses (peerJS)[https://peerjs.com/] and is reliant on their signaling servers (for now).
