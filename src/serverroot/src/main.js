import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/landing.css';
import './styles/game.css';
import { restoreSessions } from './client/matrix.js';
import { on } from './store/state.js';
import { renderAuthScreen } from './ui/AuthScreen.js';
import { renderApp } from './ui/App.js';
import { renderLandingPage } from './ui/LandingPage.js';
import { renderGameDashboard } from './ui/GameDashboard.js';

const app = document.getElementById('app');
let game = null;
let chat = null;

function clearViews() {
  if (game) game.destroy();
  game = null;
  chat = null;
  app.innerHTML = '';
}

async function boot() {
  const restored = await restoreSessions();
  if (restored) mountApp();
  else mountLanding();
}

function mountLanding() {
  clearViews();
  app.appendChild(renderLandingPage(mountAuth));
}

function mountAuth(initialTab = 'login') {
  clearViews();
  app.appendChild(renderAuthScreen({ initialTab, onBack: mountLanding }));
}

function mountApp() {
  clearViews();
  game = renderGameDashboard({ onChat: showChat });
  app.appendChild(game.element);
}

function showChat() {
  if (!chat) {
    chat = renderApp(showGame);
    app.appendChild(chat);
  }
  game.element.classList.add('game-hidden');
  chat.classList.remove('game-hidden');
}

function showGame() {
  chat.classList.add('game-hidden');
  game.element.classList.remove('game-hidden');
}

on('auth-success', mountApp);
on('logout', mountLanding);
boot();
