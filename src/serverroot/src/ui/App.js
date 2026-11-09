import { renderNavbar } from './Navbar.js';
import { renderSidebar } from './Sidebar.js';
import { renderChatArea } from './ChatArea.js';
import { renderRightPanel } from './RightPanel.js';
import { initCmdK } from './CmdK.js';
import { initProfilePopup } from './ProfilePopup.js';
import { initVerificationModal } from './modals/SASVerificationModal.js';
import { showIncomingCallDialog, handleIncomingCallAnswer, handleIncomingCallCandidate, handleIncomingCallHangup } from './modals/CallModal.js';
import { getRoomById } from '../client/matrix.js';

export function renderApp(onGame) {
  try {
    if (localStorage.getItem('trinity_compact') === '1') {
      document.documentElement.classList.add('compact');
    }
  } catch { }

  const rootEl = document.createElement('div');
  rootEl.id = 'app-root';
  rootEl.style.cssText = 'display:flex; flex-direction:column; height:100vh; width:100vw; overflow:hidden;';

  const navbar = renderNavbar(toggleSidebarDrawer, onGame);

  const mainContainer = document.createElement('div');
  mainContainer.id = 'trinity-app';
  mainContainer.style.cssText = 'display:flex; flex:1; min-height:0; position:relative; width:100%;';

  const mobileOverlay = document.createElement('div');
  mobileOverlay.className = 'mobile-overlay';
  mobileOverlay.addEventListener('click', () => closeMobileDrawer());

  const sidebar = renderSidebar(openSidebarDrawer);
  const chatArea = renderChatArea();
  const rightPanel = renderRightPanel();

  mainContainer.appendChild(mobileOverlay);
  mainContainer.appendChild(sidebar);
  mainContainer.appendChild(chatArea);
  mainContainer.appendChild(rightPanel);

  rootEl.appendChild(navbar);
  rootEl.appendChild(mainContainer);

  initCmdK();
  initProfilePopup();
  initVerificationModal();

  function toggleSidebarDrawer() {
    if (sidebar.classList.contains('mobile-open')) {
      closeMobileDrawer();
    } else {
      openSidebarDrawer();
    }
  }

  function openSidebarDrawer() {
    rightPanel.classList.remove('mobile-open');
    sidebar.classList.add('mobile-open');
    mobileOverlay.classList.add('active');
  }

  function openRightPanelDrawer() {
    sidebar.classList.remove('mobile-open');
    rightPanel.classList.add('mobile-open');
    mobileOverlay.classList.add('active');
  }

  function closeMobileDrawer() {
    sidebar.classList.remove('mobile-open');
    rightPanel.classList.remove('mobile-open');
    mobileOverlay.classList.remove('active');
  }

  // Global Notification Click Deep-Link Handler
  window.cundaiOnNotificationClick = (roomId, callId, isVideo) => {
    if (roomId) {
      setState({ activeRoomId: roomId });
      if (window.android && typeof window.android.cancelNotification === 'function') {
        window.android.cancelNotification(roomId);
      }
    }
    if (callId) {
      const roomObj = getRoomById(roomId);
      showIncomingCallDialog({
        roomId: roomId,
        roomName: roomObj?.name || 'Arama',
        callId: callId,
        isVideo: isVideo
      });
      if (window.android && typeof window.android.cancelCallNotification === 'function') {
        window.android.cancelCallNotification(callId);
      }
    }
  };

  import('../store/state.js').then(({ on }) => {
    on('state', (s) => {
      if (s.activeRoomId && window.innerWidth <= 768) closeMobileDrawer();
    });

    on('call-event', ({ event, room, userId }) => {
      if (!event || event.getSender() === userId) return;
      const type = event.getType();
      const content = event.getContent();

      if (type === 'm.call.invite') {
        const roomObj = getRoomById(room.roomId);
        const roomName = roomObj?.name || 'Matrix Kullanıcısı';
        const offerSdp = content.offer?.sdp;
        showIncomingCallDialog({
          roomId: room.roomId,
          roomName: roomName,
          callId: content.call_id,
          isVideo: true,
          offerSdp: offerSdp
        });
      } else if (type === 'm.call.answer') {
        handleIncomingCallAnswer(content.answer?.sdp);
      } else if (type === 'm.call.candidates') {
        if (Array.isArray(content.candidates)) {
          content.candidates.forEach(c => handleIncomingCallCandidate(c));
        }
      } else if (type === 'm.call.hangup') {
        handleIncomingCallHangup();
      }
    });
  });

  return rootEl;
}
