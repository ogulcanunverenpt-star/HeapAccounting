import { openUserProfileModal } from './modals/UserProfileModal.js';

let popup = null;

export function initProfilePopup() {
  popup = document.createElement('div');
}

export function showProfile(member, anchorEl) {
  if (!member || !member.userId) return;
  openUserProfileModal(member.userId, member.displayName, member.avatarUrl);
}

export function hideProfile() {
  popup?.classList.remove('open');
}
