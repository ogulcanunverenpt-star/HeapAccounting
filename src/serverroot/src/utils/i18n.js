// Cundai Türkçe / English i18n Module
const translations = {
  tr: {
    directMessages: 'Özel Mesajlar',
    roomsAndChannels: 'Odalar & Kanallar',
    members: 'Üyeler',
    threads: 'Tartışmalar',
    pins: 'İğneler',
    search: 'Ara',
    settings: 'Ayarlar',
    accounts: 'Hesaplar',
    appearance: 'Görünüm',
    notifications: 'Bildirimler',
    privacy: 'Gizlilik',
    language: 'Uygulama Dili / Language',
    turkish: 'Türkçe 🇹🇷',
    english: 'English 🇬🇧',
    inviteUser: 'Kullanıcı Davet Et',
    editRoom: 'Oda Profilini Düzenle',
    leaveRoom: 'Odadan Ayrıl',
    startChat: 'Yeni Özel Sohbet Başlat',
    noRoomSelected: 'Sohbete başlamak için soldan bir oda seçin veya yeni mesaj başlatın',
    save: 'Profili Kaydet',
    signOut: 'Tüm Hesaplardan Çıkış Yap',
  },
  en: {
    directMessages: 'Direct Messages',
    roomsAndChannels: 'Rooms & Channels',
    members: 'Members',
    threads: 'Threads',
    pins: 'Pins',
    search: 'Search',
    settings: 'Settings',
    accounts: 'Accounts',
    appearance: 'Appearance',
    notifications: 'Notifications',
    privacy: 'Privacy',
    language: 'Application Language',
    turkish: 'Türkçe 🇹🇷',
    english: 'English 🇬🇧',
    inviteUser: 'Invite User',
    editRoom: 'Edit Room Profile',
    leaveRoom: 'Leave Room',
    startChat: 'Start Direct Message',
    noRoomSelected: 'Select a room from the left or start a new chat to begin',
    save: 'Save Profile',
    signOut: 'Sign Out All Accounts',
  }
};

export function getLang() {
  return localStorage.getItem('cundai_lang') || 'tr';
}

export function setLang(lang) {
  localStorage.setItem('cundai_lang', lang);
  window.location.reload();
}

export function t(key) {
  const lang = getLang();
  return translations[lang]?.[key] || translations['tr']?.[key] || key;
}
