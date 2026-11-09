import { getVoipTurnServers, sendCallInvite, sendCallAnswer, sendCallCandidates, sendCallHangup } from '../../client/matrix.js';
import { toastSuccess, toastError } from '../../utils/toast.js';
import { playIncomingSound } from '../../utils/audio.js';

let overlay = null;
let incomingOverlay = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentRoomId = null;
let currentCallId = null;
let isVideoCall = true;
let isMuted = false;
let isCameraOff = false;
let callTimer = null;
let callDurationSec = 0;

export async function openCallModal({ roomId, roomName, isVideo = true, callId = null, isIncoming = false, offerSdp = null }) {
  currentRoomId = roomId;
  currentCallId = callId || 'call_' + Math.random().toString(36).substring(2, 12);
  isVideoCall = isVideo;
  isMuted = false;
  isCameraOff = false;
  callDurationSec = 0;

  if (!overlay) buildModal();
  updateModalUI(roomName);
  overlay.classList.add('open');

  await startWebRTCCall(isIncoming, offerSdp);
}

export function showIncomingCallDialog({ roomId, roomName, callId, isVideo = true, offerSdp }) {
  playIncomingSound();

  if (window.android && typeof window.android.notifyCall === 'function') {
    window.android.notifyCall(roomName || 'Arama', roomName || 'Matrix', roomId, callId, isVideo);
  }

  if (!incomingOverlay) buildIncomingModal();

  incomingOverlay.querySelector('#inc-call-title').textContent = roomName || 'Matrix Kullanıcısı';
  incomingOverlay.querySelector('#inc-call-type').textContent = isVideo ? 'Gelen Görüntülü Arama…' : 'Gelen Sesli Arama…';
  incomingOverlay.querySelector('#inc-call-initials').textContent = (roomName || 'C').charAt(0).toUpperCase();

  const acceptBtn = incomingOverlay.querySelector('#btn-inc-accept');
  const rejectBtn = incomingOverlay.querySelector('#btn-inc-reject');

  const newAcceptBtn = acceptBtn.cloneNode(true);
  const newRejectBtn = rejectBtn.cloneNode(true);
  acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
  rejectBtn.parentNode.replaceChild(newRejectBtn, rejectBtn);

  newAcceptBtn.addEventListener('click', async () => {
    closeIncomingModal();
    await openCallModal({ roomId, roomName, isVideo, callId, isIncoming: true, offerSdp });
  });

  newRejectBtn.addEventListener('click', () => {
    closeIncomingModal();
    sendCallHangup(roomId, callId, 'user_busy');
  });

  incomingOverlay.classList.add('open');
}

export function closeIncomingModal() {
  if (window.android && typeof window.android.cancelCallNotification === 'function' && currentCallId) {
    window.android.cancelCallNotification(currentCallId);
  }
  incomingOverlay?.classList.remove('open');
}

export function closeCallModal() {
  if (currentRoomId && currentCallId) {
    sendCallHangup(currentRoomId, currentCallId);
  }
  stopWebRTCCall();
  overlay?.classList.remove('open');
}

export function handleIncomingCallCandidate(candidate) {
  if (peerConnection && candidate) {
    try {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('addIceCandidate error:', err);
    }
  }
}

export function handleIncomingCallAnswer(answerSdp) {
  if (peerConnection && answerSdp) {
    try {
      peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
      toastSuccess('Arama bağlandı!');
    } catch (err) {
      console.warn('setRemoteDescription answer error:', err);
    }
  }
}

export function handleIncomingCallHangup() {
  if (!currentCallId) return;
  currentCallId = null;
  toastError('Arama sonlandırıldı');
  closeCallModal();
  closeIncomingModal();
}

function buildIncomingModal() {
  incomingOverlay = document.createElement('div');
  incomingOverlay.className = 'modal-overlay';
  incomingOverlay.style.zIndex = '980';

  incomingOverlay.innerHTML = `
    <div class="modal" style="width:420px; max-width:calc(100vw - 28px); background:var(--bg2); border-radius:24px; padding:28px; display:flex; flex-direction:column; align-items:center; text-align:center; box-shadow:0 24px 60px rgba(0,0,0,0.85);">
      <div class="panel-big-avatar initial-gold" style="width:84px; height:80px; font-size:34px; margin-bottom:14px;" id="inc-call-initials">C</div>
      <div style="font-family:'Syne',sans-serif; font-size:20px; font-weight:800; color:#ffffff; margin-bottom:4px;" id="inc-call-title">Matrix Kullanıcısı</div>
      <div style="font-size:14px; color:var(--yellow); font-weight:600; margin-bottom:24px;" id="inc-call-type">Gelen Görüntülü Arama…</div>

      <div style="display:flex; align-items:center; justify-content:center; gap:24px; width:100%;">
        <button class="call-control-btn" id="btn-inc-reject" style="background:var(--red) !important; color:#ffffff !important; width:56px; height:56px; font-size:22px;">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
        <button class="call-control-btn" id="btn-inc-accept" style="background:var(--green) !important; color:#ffffff !important; width:56px; height:56px; font-size:22px;">
          <i class="fa-solid fa-phone"></i>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(incomingOverlay);
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '900';

  overlay.innerHTML = `
    <div class="modal" style="width:520px; max-width:calc(100vw - 28px); background:var(--bg2); border-radius:24px; padding:24px; display:flex; flex-direction:column; align-items:center; box-shadow:0 24px 60px rgba(0,0,0,0.8);">
      <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:800; color:#ffffff; margin-bottom:4px;" id="call-room-name">Arama</div>
      <div style="font-size:13px; color:var(--yellow); font-weight:600; margin-bottom:16px;" id="call-status">Aranıyor…</div>

      <!-- Video Streams Area -->
      <div style="width:100%; height:260px; background:#000000; border-radius:18px; position:relative; overflow:hidden; border:1px solid var(--border-hi); display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
        <video id="remote-video" autoplay playsinline webkit-playsinline style="width:100%; height:100%; object-fit:cover; display:none;"></video>
        <div id="video-avatar-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:10px;">
          <div class="panel-big-avatar initial-gold" style="width:80px; height:80px; font-size:32px;" id="call-avatar-initials">C</div>
        </div>
        <video id="local-video" autoplay playsinline webkit-playsinline muted style="position:absolute; bottom:12px; right:12px; width:100px; height:75px; object-fit:cover; border-radius:10px; border:2px solid var(--yellow); box-shadow:0 4px 12px rgba(0,0,0,0.5);"></video>
      </div>

      <!-- Call Control Action Buttons -->
      <div style="display:flex; align-items:center; justify-content:center; gap:16px; width:100%;">
        <button class="call-control-btn" id="btn-toggle-mic" title="Mikrofon">
          <i class="fa-solid fa-microphone"></i>
        </button>

        <button class="call-control-btn" id="btn-toggle-cam" title="Kamera">
          <i class="fa-solid fa-video"></i>
        </button>

        <button class="call-control-btn end-call" id="btn-end-call" title="Aramayı Sonlandır" style="background:var(--red) !important; color:#ffffff !important; width:52px; height:52px; font-size:20px;">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#btn-toggle-mic').addEventListener('click', toggleMic);
  overlay.querySelector('#btn-toggle-cam').addEventListener('click', toggleCam);
  overlay.querySelector('#btn-end-call').addEventListener('click', closeCallModal);

  document.body.appendChild(overlay);
}

function updateModalUI(roomName) {
  if (!overlay) return;
  overlay.querySelector('#call-room-name').textContent = roomName || 'Arama';
  overlay.querySelector('#call-status').textContent = isVideoCall ? 'Görüntülü Arama Başlatılıyor…' : 'Sesli Arama Başlatılıyor…';
  overlay.querySelector('#call-avatar-initials').textContent = (roomName || 'C').charAt(0).toUpperCase();

  const camBtn = overlay.querySelector('#btn-toggle-cam');
  if (camBtn) camBtn.style.display = isVideoCall ? 'flex' : 'none';
}

async function startWebRTCCall(isIncoming = false, offerSdp = null) {
  if (window.android && typeof window.android.requestMediaPermissions === 'function') {
    window.android.requestMediaPermissions();
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideoCall,
    });

    const localVideo = overlay.querySelector('#local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.style.display = isVideoCall ? 'block' : 'none';
      localVideo.play().catch(() => {});
    }

    const turnServers = await getVoipTurnServers();
    const iceServers = turnServers.flatMap(s => {
      if (Array.isArray(s.urls)) {
        return [{ urls: s.urls, username: s.username, credential: s.credential }];
      }
      return [{ urls: s.urls, username: s.username, credential: s.credential }];
    });

    peerConnection = new RTCPeerConnection({ iceServers });

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      const remoteVideo = overlay.querySelector('#remote-video');
      const placeholder = overlay.querySelector('#video-avatar-placeholder');
      if (remoteVideo && event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.style.display = 'block';
        remoteVideo.play().catch(() => {});
      }
      if (placeholder) placeholder.style.display = 'none';
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentRoomId && currentCallId) {
        sendCallCandidates(currentRoomId, currentCallId, [event.candidate.toJSON()]);
      }
    };

    if (isIncoming && offerSdp) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      if (currentRoomId && currentCallId) {
        await sendCallAnswer(currentRoomId, currentCallId, answer.sdp);
      }
    } else {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (currentRoomId && currentCallId) {
        await sendCallInvite(currentRoomId, currentCallId, offer.sdp);
      }
    }

    startCallTimer();
    toastSuccess('Coturn TURN bağlantısı kuruldu');
  } catch (err) {
    console.warn('getUserMedia / WebRTC error:', err);
    const statusEl = overlay?.querySelector('#call-status');
    if (statusEl) {
      statusEl.textContent = 'Kamera/Mikrofon izni bekleniyor...';
    }
  }
}

function toggleMic() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
  const btn = overlay.querySelector('#btn-toggle-mic');
  if (btn) {
    btn.innerHTML = isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
    btn.style.background = isMuted ? 'var(--red)' : 'var(--bg3)';
  }
}

function toggleCam() {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks().forEach(track => { track.enabled = !isCameraOff; });
  const btn = overlay.querySelector('#btn-toggle-cam');
  if (btn) {
    btn.innerHTML = isCameraOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
    btn.style.background = isCameraOff ? 'var(--red)' : 'var(--bg3)';
  }
}

function startCallTimer() {
  clearInterval(callTimer);
  callDurationSec = 0;
  callTimer = setInterval(() => {
    callDurationSec++;
    const mins = Math.floor(callDurationSec / 60).toString().padStart(2, '0');
    const secs = (callDurationSec % 60).toString().padStart(2, '0');
    const statusEl = overlay?.querySelector('#call-status');
    if (statusEl) {
      statusEl.textContent = `Arama Devam Ediyor (${mins}:${secs})`;
    }
  }, 1000);
}

function stopWebRTCCall() {
  clearInterval(callTimer);
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}
