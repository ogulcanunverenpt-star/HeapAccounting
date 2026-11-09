import { getLang, setLang } from '../utils/i18n.js';

const copy = {
  tr: {
    navFeatures: 'Oyun',
    navHow: 'Nasıl oynanır?',
    navLogin: 'Giriş yap',
    navSignup: 'Başla',
    eyebrow: 'MUHASEBE × OYUN',
    titleStart: 'Hesabı çöz,',
    titleAccent: 'zamana karşı yarış.',
    intro: 'Muhasebe senaryolarını çöz, doğru yevmiye kayıtlarını oluştur ve hızını geliştir. CTF heyecanı, muhasebe bilgisiyle buluşuyor.',
    primary: 'Oyuna giriş yap',
    secondary: 'Hesap oluştur',
    heroNote: 'Türkiye odaklı senaryolar · Matrix ile giriş',
    mockLabel: 'ÖRNEK GÖREV',
    mockTitle: 'Satışı kaydet',
    mockBadge: 'Temsili',
    mockSubtitle: 'Verileri incele ve doğru yevmiye kaydını bul.',
    mockAccounts: 'GÖREV DETAYLARI',
    mockRoom: 'Peşin satış senaryosu',
    mockAccount1: 'Satış ve KDV',
    mockAccount2: 'Borç / alacak dengesi',
    mockAccount3: 'Süreye karşı çözüm',
    mockActivity: 'SIRALAMA',
    mockMessage: 'Elo ile sıralamaya katıl.',
    mockHint: 'Temsili görünüm. Sınavlar ve sıralama için sınav servisi kurulmalıdır.',
    sectionTag: 'MUHASEBEYE MEYDAN OKU',
    sectionTitle: 'Muhasebe bilgini oyuna taşı.',
    sectionIntro: 'Tekdüzen hesap planından ilham alan senaryolarla bilgini pratik yaparak geliştir.',
    feature1Title: 'Senaryoyu çöz',
    feature1Text: 'Verilen işlem verilerini incele ve doğru hesaplarla yevmiye kaydını oluştur.',
    feature2Title: 'Hızını geliştir',
    feature2Text: 'Alıştırmada süreni ve yanlış denemelerini gör; yeniden deneyerek geliş.',
    feature3Title: 'Sıralamaya hazırlan',
    feature3Text: 'Alıştırmayı geç, 100 Elo ile başla ve sınav puanına göre sıralamada ilerle.',
    howTag: 'NASIL OYNANIR?',
    howTitle: 'Verileri oku. Kaydı oluştur. Kendini geliştir.',
    step1Title: 'Matrix hesabınızla giriş yapın',
    step1Text: 'Mevcut Matrix hesabınla giriş yap; hesabın yoksa bir sağlayıcıda oluştur.',
    step2Title: 'Görevi başlat',
    step2Text: 'Senaryoyu oku, verilen tutarları kullan ve doğru hesapları seç.',
    step3Title: 'Çözümünü kontrol et',
    step3Text: 'Kaydını gönder, sonucu ve alıştırma süreni gör.',
    disclaimer: 'HeapAccounting geliştirilmekte olan bir eğitim oyunudur. Sınavlar ve isteğe bağlı yapay zekâ yardımı kurulum gerektirir; Matrix senkronizasyonu henüz hazır değildir. Senaryolar profesyonel danışmanlık veya mevzuata uygunluk garantisi değildir.',
    ctaTitle: 'İlk senaryoya hazır mısın?',
    ctaText: 'Matrix hesabınla giriş yap ve ilk muhasebe görevini dene.',
    footer: 'Muhasebeyi oyunla öğren.',
    language: 'Dil',
  },
  en: {
    navFeatures: 'The game',
    navHow: 'How to play',
    navLogin: 'Sign in',
    navSignup: 'Get started',
    eyebrow: 'ACCOUNTING × GAME',
    titleStart: 'Solve the books,',
    titleAccent: 'race the clock.',
    intro: 'Solve accounting scenarios, build accurate journal entries and improve your time. CTF-style challenges meet accounting.',
    primary: 'Sign in to play',
    secondary: 'Create an account',
    heroNote: 'Scenarios inspired by Türkiye · Sign in with Matrix',
    mockLabel: 'SAMPLE CHALLENGE',
    mockTitle: 'Record the sale',
    mockBadge: 'Illustrative',
    mockSubtitle: 'Review the facts and find the correct journal entry.',
    mockAccounts: 'CHALLENGE DETAILS',
    mockRoom: 'Cash sale scenario',
    mockAccount1: 'Sale and VAT',
    mockAccount2: 'Debits and credits',
    mockAccount3: 'Race against time',
    mockActivity: 'LEADERBOARD',
    mockMessage: 'Join the Elo leaderboard.',
    mockHint: 'Illustrative preview. Exams and rankings require the exam service to be configured.',
    sectionTag: 'CHALLENGE YOUR ACCOUNTING SKILLS',
    sectionTitle: 'Put your accounting skills into play.',
    sectionIntro: 'Practice with scenarios inspired by Türkiye’s uniform chart of accounts.',
    feature1Title: 'Solve the scenario',
    feature1Text: 'Review the transaction and build the journal entry using the right accounts.',
    feature2Title: 'Improve your time',
    feature2Text: 'See your practice time and incorrect attempts, then try again.',
    feature3Title: 'Get ready to compete',
    feature3Text: 'Pass the practice challenge, start at 100 Elo and progress based on your exam score.',
    howTag: 'HOW TO PLAY',
    howTitle: 'Read the facts. Make the entry. Improve.',
    step1Title: 'Sign in with Matrix',
    step1Text: 'Sign in with an existing Matrix account or create one with a provider.',
    step2Title: 'Start the challenge',
    step2Text: 'Read the scenario, use the given amounts and choose the correct accounts.',
    step3Title: 'Check your solution',
    step3Text: 'Submit your entry and see the result and your practice time.',
    disclaimer: 'HeapAccounting is an educational game in development. Exams and optional AI help require configuration; Matrix synchronization is not available yet. Scenarios are not professional advice or a guarantee of regulatory compliance.',
    ctaTitle: 'Ready for your first challenge?',
    ctaText: 'Sign in with your Matrix account and try your first accounting challenge.',
    footer: 'Learn accounting through play.',
    language: 'Language',
  },
};

export function renderLandingPage(onAuth) {
  const lang = getLang() === 'en' ? 'en' : 'tr';
  const text = copy[lang];
  document.documentElement.lang = lang;
  document.title = 'HeapAccounting';

  const page = document.createElement('div');
  page.className = 'landing';
  page.innerHTML = `
    <header class="landing-header">
      <a class="landing-brand" href="#landing-top" aria-label="HeapAccounting">
        <span class="landing-brand-icon" aria-hidden="true"><i class="fa-solid fa-layer-group"></i></span>
        <span>Heap<span class="landing-brand-accent">Accounting</span></span>
      </a>
      <nav class="landing-nav" aria-label="${lang === 'tr' ? 'Ana menü' : 'Main navigation'}">
        <a href="#landing-features">${text.navFeatures}</a>
        <a href="#landing-how">${text.navHow}</a>
      </nav>
      <div class="landing-actions">
        <div class="landing-languages" role="group" aria-label="${text.language}">
          <button type="button" data-lang="tr" aria-pressed="${lang === 'tr'}">TR</button>
          <button type="button" data-lang="en" aria-pressed="${lang === 'en'}">EN</button>
        </div>
        <button type="button" class="landing-login" data-auth="login">${text.navLogin}</button>
        <button type="button" class="landing-button landing-button-small" data-auth="register">${text.navSignup} <span aria-hidden="true">↗</span></button>
      </div>
    </header>

    <main id="landing-top">
      <section class="landing-hero">
        <div class="landing-hero-copy">
          <div class="landing-eyebrow"><span></span>${text.eyebrow}</div>
          <h1>${text.titleStart}<br><em>${text.titleAccent}</em></h1>
          <p class="landing-intro">${text.intro}</p>
          <div class="landing-hero-actions">
            <button type="button" class="landing-button" data-auth="login">${text.primary} <span aria-hidden="true">→</span></button>
            <button type="button" class="landing-button-outline" data-auth="register">${text.secondary}</button>
          </div>
          <p class="landing-hero-note"><i class="fa-solid fa-circle-nodes" aria-hidden="true"></i> ${text.heroNote}</p>
        </div>

        <div class="landing-preview" aria-label="${text.mockLabel}">
          <div class="landing-preview-top">
            <div><span class="landing-preview-label">${text.mockLabel}</span><h2>${text.mockTitle}</h2></div>
            <span class="landing-preview-badge">${text.mockBadge}</span>
          </div>
          <p class="landing-preview-subtitle">${text.mockSubtitle}</p>
          <div class="landing-preview-content">
            <div class="landing-preview-bar"><span>${text.mockAccounts}</span><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></div>
            <div class="landing-preview-room"><span class="landing-preview-icon"><i class="fa-solid fa-flag" aria-hidden="true"></i></span><strong>${text.mockRoom}</strong></div>
            <div class="landing-preview-row"><span><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${text.mockAccount1}</span></div>
            <div class="landing-preview-row"><span><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${text.mockAccount2}</span></div>
            <div class="landing-preview-row"><span><i class="fa-regular fa-clock" aria-hidden="true"></i> ${text.mockAccount3}</span></div>
            <div class="landing-preview-activity"><span>${text.mockActivity}</span><p><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${text.mockMessage}</p></div>
          </div>
          <p class="landing-preview-hint">${text.mockHint}</p>
        </div>
      </section>

      <section class="landing-section" id="landing-features">
        <div class="landing-section-heading"><div><p class="landing-section-tag">${text.sectionTag}</p><h2>${text.sectionTitle}</h2></div><p>${text.sectionIntro}</p></div>
        <div class="landing-features">
          <article><span class="landing-feature-icon"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i></span><h3>${text.feature1Title}</h3><p>${text.feature1Text}</p></article>
          <article><span class="landing-feature-icon"><i class="fa-regular fa-clock" aria-hidden="true"></i></span><h3>${text.feature2Title}</h3><p>${text.feature2Text}</p></article>
          <article><span class="landing-feature-icon"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span><h3>${text.feature3Title}</h3><p>${text.feature3Text}</p></article>
        </div>
      </section>

      <section class="landing-section landing-roadmap" id="landing-how">
        <div><p class="landing-section-tag">${text.howTag}</p><h2>${text.howTitle}</h2></div>
        <div class="landing-steps">
          <article><span>01</span><div><h3>${text.step1Title}</h3><p>${text.step1Text}</p></div></article>
          <article><span>02</span><div><h3>${text.step2Title}</h3><p>${text.step2Text}</p></div></article>
          <article><span>03</span><div><h3>${text.step3Title}</h3><p>${text.step3Text}</p></div></article>
        </div>
      </section>
      <section class="landing-cta">
        <div><h2>${text.ctaTitle}</h2><p>${text.ctaText}</p></div>
        <button type="button" class="landing-button" data-auth="login">${text.navLogin} <span aria-hidden="true">→</span></button>
      </section>
      <p class="landing-disclaimer">${text.disclaimer}</p>
    </main>
    <footer class="landing-footer"><strong>Heap<span>Accounting</span></strong><p>${text.footer}</p><span>© ${new Date().getFullYear()}</span></footer>
  `;
  page.querySelectorAll('[data-auth]').forEach(button => {
    button.addEventListener('click', () => onAuth(button.dataset.auth));
  });
  page.querySelectorAll('[data-lang]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.lang !== lang) setLang(button.dataset.lang);
    });
  });
  return page;
}
