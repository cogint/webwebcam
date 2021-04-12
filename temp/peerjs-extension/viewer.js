
window.addEventListener('load', async ()=> {


    let video = document.querySelector('video');

    const peerId = '2ceef1a5-2145-43a6-8cba-235423af1412';
    let peer = new Peer(`${peerId}-viewer`, {debug: 0});

    peer.on('open', id => console.log(`My peer ID is ${id}. Waiting for call`));

    peer.on('connection', conn => {

        conn.on('data', data => console.log(`Incoming data: ${data}`))
    });
    peer.on('disconnected', () => console.log("Peer disconnected"));

    peer.on('call', call => {
        call.on('stream', stream => {
            if(video.srcObject && video.srcObject.id === stream.id){
                console.log("duplicate stream. (bad peerjs)", stream);
                return;
            }


            console.log("Got stream, setting video source", stream);
            video.srcObject = stream;
            window.stream = stream;
        });
        console.log("Answering incoming call");
        call.answer();
    });

    window.peer = peer;
});
