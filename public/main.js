const localVideo = document.getElementById("local-video");
const remotesDiv = document.getElementById("remotes");

/* eslint-env browser */
const joinBtn = document.getElementById("join-btn");
const leaveBtn = document.getElementById("leave-btn");
const publishBtn = document.getElementById("publish-btn");
const publishSBtn = document.getElementById("publish-sharedscreen-btn");

const codecBox = document.getElementById("select-box1");
const resolutionBox = document.getElementById("select-box2");
const simulcastBox = document.getElementById("check-box");
const localData = document.getElementById("local-data");
const remoteData = document.getElementById("remote-data");
const remoteSignal = document.getElementById("remote-signal");
const subscribeBox = document.getElementById("select-box3");
const sizeTag = document.getElementById("size-tag");
const brTag = document.getElementById("br-tag");
let trackEvent;

const config = {
    iceServers: [
        {
            urls: ['stun:stun.l.google.com:19302'],
        },
        // {
        //   urls: ['turn:ucs-turn.dev2.ar2:3478'],
        //   username: "pion",
        //   credential: "ion",
        // },
    ],
}
let room;
let rtc;
let localStream;
let start;
let connector;
let sockets = [];

let signalUrl;
let sid;
let uid;
let token;

const join = async () => {
    signalUrl = document.getElementById("signalUrl").value;
    sid = document.getElementById("roomId").value;
    uid = document.getElementById("userId").value;
    token = document.getElementById("token").value;

    console.log("[join]: sid=" + sid + " uid=", uid)
    console.log("[join]: token=", token)

    connector = new Ion.Connector(signalUrl, token);

    connector.onopen = function (service) {
        console.log("[onopen]: service = ", service.name);
    };

    connector.onclose = function (service) {
        console.log('[onclose]: service = ' + service.name);
    };

    room = new Ion.Room(connector);

    room.onjoin = function (result) {
        console.log('[onjoin]: success ' + result.success + ', room info: ' + JSON.stringify(result.room));
    };

    room.onleave = function (reason) {
        console.log('[onleave]: leave room, reason ' + reason);
    };

    room.onmessage = function (msg) {
        console.log('[onmessage]: Received msg:', msg)
        const uint8Arr = new Uint8Array(msg.data);
        const decodedString = String.fromCharCode.apply(null, uint8Arr);
        const json = JSON.parse(decodedString);
        remoteData.innerHTML = remoteData.innerHTML + json.msg.text + '\n';
    };

    room.onpeerevent = function (event) {
        switch (event.state) {
            case Ion.PeerState.JOIN:
                console.log('[onpeerevent]: Peer ' + event.peer.uid + ' joined');
                break;
            case Ion.PeerState.LEAVE:
                console.log('[onpeerevent]: Peer ' + event.peer.uid + ' left');
                break;
            case Ion.PeerState.UPDATE:
                console.log('[onpeerevent]: Peer ' + event.peer.uid + ' updated');
                break;
        }
    };

    room.onroominfo = function (info) {
        console.log('[onroominfo]: ' + JSON.stringify(info));
    };

    room.ondisconnect = function (dis) {
        console.log('[ondisconnect]: Disconnected from server ' + dis);
    };

    const result = await room.join({
        sid: sid,
        uid: uid,
        displayname: 'new peer',
        extrainfo: '',
        destination: 'webrtc://ion/peer1',
        role: Ion.Role.HOST,
        protocol: Ion.Protocol.WEBRTC,
        avatar: 'string',
        direction: Ion.Direction.INCOMING,
        vendor: 'string',
    }, '')
        .then((result) => {
            console.log('[join] result: success ' + result?.success + ', room info: ' + JSON.stringify(result?.room));
            joinBtn.disabled = "true";
            remoteData.innerHTML = remoteData.innerHTML + JSON.stringify(result) + '\n';
            leaveBtn.removeAttribute('disabled');
            publishBtn.removeAttribute('disabled');
            publishSBtn.removeAttribute('disabled');

            rtc = new Ion.RTC(connector, config);

            rtc.ontrack = (track, stream) => {
                console.log("got ", track.kind, " track", track.id, "for stream", stream.id);
                if (track.kind === "video") {
                    track.onunmute = () => {
                        if (!streams[stream.id]) {
                            const remoteVideo = document.createElement("video");
                            remoteVideo.srcObject = stream;
                            remoteVideo.autoplay = true;
                            remoteVideo.muted = true;
                            remoteVideo.addEventListener("loadedmetadata", function () {
                                sizeTag.innerHTML = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
                            });

                            remoteVideo.onresize = function () {
                                sizeTag.innerHTML = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
                            };
                            remotesDiv.appendChild(remoteVideo);
                            streams[stream.id] = stream;
                            stream.onremovetrack = () => {
                                if (streams[stream.id]) {
                                    remotesDiv.removeChild(remoteVideo);
                                    streams[stream.id] = null;
                                }
                            };
                            getStats();
                        }
                    };
                }
                subscribe();
            };

            rtc.ontrackevent = function (ev) {
                console.log("ontrackevent: \nuid = ", ev.uid, " \nstate = ", ev.state, ", \ntracks = ", JSON.stringify(ev.tracks));
                if (trackEvent === undefined) {
                    console.log("store trackEvent=", ev)
                    trackEvent = ev;
                }
                remoteSignal.innerHTML = remoteSignal.innerHTML + JSON.stringify(ev) + '\n';
                subscribe();
            };

            rtc.join(sid, uid);

            const streams = {};

            start = (sc) => {
                publishSBtn.disabled = "true";
                publishBtn.disabled = "true";

                let constraints = {
                    resolution: resolutionBox.options[resolutionBox.selectedIndex].value,
                    codec: codecBox.options[codecBox.selectedIndex].value,
                    audio: false,
                    simulcast: false,
                }
                console.log("getUserMedia constraints=", constraints)
                if (sc) {
                    Ion.LocalStream.getDisplayMedia(constraints)
                        .then((media) => {
                            localStream = media;
                            localVideo.srcObject = media;
                            localVideo.autoplay = true;
                            localVideo.controls = true;
                            localVideo.muted = true;

                            rtc.publish(media);
                        })
                        .catch(console.error);
                } else {
                    Ion.LocalStream.getUserMedia(constraints)
                        .then((media) => {
                            localStream = media;
                            localVideo.srcObject = media;
                            localVideo.autoplay = true;
                            localVideo.controls = true;
                            localVideo.muted = true;

                            rtc.publish(media);
                        })
                        .catch(console.error);
                }
            };
        });
}

const send = () => {
    if (!room) {
        alert('join room first!', '', {
            confirmButtonText: 'OK',
        });
        return
    }

    // var attachment = {
    //     name: "testFile",
    //     size: 100,
    //     content_type: "image/jpeg",
    //     file_id: "f67cb8f5-0645-444d-a4bd-c61aaf1b2db0",//<<--- set this to 'file_id' from presigned upload GET response, must be in UUID format
    // };

    var data = {
        uid: uid,
        name: "test",
        text: localData.value,
        // attachment: attachment,
        mime_type: "message"
    };

    let map = new Map();
    map.set('msg', data)
    console.log("[send]: sid=", sid, "from=", 'sender', "to=", uid, "payload=", map);
    room.message(sid, uid, "all", 'Map', map);
}

const leave = () => {
    console.log("[leave]: sid=" + sid + " uid=", uid)
    room.leave(sid, uid);
    joinBtn.removeAttribute('disabled');
    leaveBtn.disabled = "true";
    publishBtn.disabled = "true";
    publishSBtn.disabled = "true";
    location.reload();
}

const subscribe = () => {
    let layer = subscribeBox.value
    console.log("subscribe trackEvent=", trackEvent, "layer=", layer)
    var infos = [];
    trackEvent.tracks.forEach(t => {
        if (t.layer === layer && t.kind === "video") {
            infos.push({
                track_id: t.id,
                mute: t.muted,
                layer: t.layer,
                subscribe: true
            });
        }

        if (t.kind === "audio") {
            infos.push({
                track_id: t.id,
                mute: t.muted,
                layer: t.layer,
                subscribe: true
            });
        }
    });
    console.log("subscribe infos=", infos)
    rtc.subscribe(infos);
}


const controlLocalVideo = (radio) => {
    if (radio.value === "false") {
        localStream.mute("video");
    } else {
        localStream.unmute("video");
    }
};

const controlLocalAudio = (radio) => {
    if (radio.value === "false") {
        localStream.mute("audio");
    } else {
        localStream.unmute("audio");
    }
};

const getStats = () => {
    let bytesPrev;
    let timestampPrev;
    setInterval(() => {
        rtc.getSubStats(null).then((results) => {
            results.forEach((report) => {
                const now = report.timestamp;

                let bitrate;
                if (
                    report.type === "inbound-rtp" &&
                    report.mediaType === "video"
                ) {
                    const bytes = report.bytesReceived;
                    if (timestampPrev) {
                        bitrate = (8 * (bytes - bytesPrev)) / (now - timestampPrev);
                        bitrate = Math.floor(bitrate);
                    }
                    bytesPrev = bytes;
                    timestampPrev = now;
                }
                if (bitrate) {
                    brTag.innerHTML = `${bitrate} kbps @ ${report.framesPerSecond} fps`;
                }
            });
        });
    }, 1000);
};

const pingWebSocket = () => {
    var msg = new Blob([""], {type: "text/plain"});
    if (sockets.length > 0) {
        sockets.forEach(function (socket) {
            if (socket.readyState === 1) {
                socket.send(msg);
                // console.log("Pinging every 10 secs at ", socket.url);
            }
        });
    }
}

