import { getState, on, getActiveAccount, setState } from '../store/state.js';
import { openCmdK } from './CmdK.js';
import { openSettings } from './modals/SettingsModal.js';
import { openCreateRoom } from './modals/CreateRoomModal.js';
import { openCompanyWorkspace } from './modals/CompanyWorkspaceModal.js';
import { getLang } from '../utils/i18n.js';

export function renderNavbar(onGridMenuClick, onGame) {
  const nav = document.createElement('div');
  nav.className = 'top-navbar';
  nav.innerHTML = `
    <div class="nav-left">
      <div class="nav-brand">CUND<span>AI</span></div>
     
    </div>
    <div class="nav-right">
      ${onGame ? `<button class="nav-action-btn game-return" type="button" aria-label="${getLang() === 'en' ? 'Return to game' : 'Oyuna dön'}"><i class="fa-solid fa-gamepad" aria-hidden="true"></i> <span>${getLang() === 'en' ? 'Game' : 'Oyun'}</span></button>` : ''}
      <button class="nav-action-btn company-workspace-trigger" id="nav-company-workspace" type="button" aria-label="${getLang() === 'en' ? 'Company rooms' : 'Şirket odaları'}">
        <i class="fa-solid fa-building" aria-hidden="true"></i> <span>${getLang() === 'en' ? 'Company rooms' : 'Şirket odaları'}</span>
      </button>
      <!-- Desktop Navbar Items -->
      <div class="nav-actions d-none-mobile">
        <button class="nav-action-btn" id="nav-btn-cmdk" title="Search"><i class="fa-solid fa-magnifying-glass me-1"></i> <kbd>⌘K</kbd></button>
        <button class="nav-action-btn" id="nav-btn-settings" title="Settings"><i class="fa-solid fa-gear me-1"></i> Ayarlar</button>
        <div class="nav-user-avatar" id="nav-user-avatar" title="Account">
          <span id="nav-user-initials">C</span>
        </div>
      </div>

      <!-- Mobile Right Grid Menu Button (Izgara Menü) -->
      <button class="grid-menu-btn d-only-mobile" id="grid-menu-btn" title="Menü">
        <i class="fa-solid fa-grip"></i>
      </button>
    </div>
  `;

  // Sync Active State & Avatar
  function refreshNavbar() {
    const state = getState();
    const filter = state.sidebarFilter || 'dms';

    const dmsBtn = nav.querySelector('#nav-btn-dms');
    const roomsBtn = nav.querySelector('#nav-btn-rooms');

    if (dmsBtn && roomsBtn) {
      if (filter === 'dms') {
        dmsBtn.classList.add('active');
        roomsBtn.classList.remove('active');
      } else {
        roomsBtn.classList.add('active');
        dmsBtn.classList.remove('active');
      }
    }

    const account = getActiveAccount();
    const initialsEl = nav.querySelector('#nav-user-initials');
    if (account && initialsEl) {
      const name = account.displayName || account.userId.split(':')[0].replace('@', '');
      initialsEl.textContent = name.charAt(0).toUpperCase();
    }
  }

  refreshNavbar();
  on('state', refreshNavbar);

  // Event Listeners
  nav.querySelector('.game-return')?.addEventListener('click', onGame);
  nav.querySelector('.nav-brand')?.addEventListener('click', () => {
    setState({ activeRoomId: null, viewingUserId: null });
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  });

  nav.querySelector('#nav-btn-dms')?.addEventListener('click', () => {
    setState({ sidebarFilter: 'dms' });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.add('mobile-open');
  });

  nav.querySelector('#nav-btn-rooms')?.addEventListener('click', () => {
    setState({ sidebarFilter: 'rooms' });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.add('mobile-open');
  });

  nav.querySelector('#nav-btn-cmdk')?.addEventListener('click', () => openCmdK());
  nav.querySelector('#nav-company-workspace')?.addEventListener('click', openCompanyWorkspace);
  nav.querySelector('#nav-btn-settings')?.addEventListener('click', () => openSettings());
  nav.querySelector('#nav-user-avatar')?.addEventListener('click', () => openSettings('accounts'));

  // Mobile Grid Button Click Handler
  nav.querySelector('#grid-menu-btn')?.addEventListener('click', () => {
    if (onGridMenuClick) onGridMenuClick();
  });

  return nav;
}
