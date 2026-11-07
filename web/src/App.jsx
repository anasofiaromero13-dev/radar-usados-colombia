import './radar-usados.css';
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './components/Icon.jsx';
import Login from './pages/Login.jsx';
import Usados from './pages/Usados.jsx';
import Terminos, { TerminosTexto } from './pages/Terminos.jsx';

const appName = 'Radar Usados Colombia';
const tabs = [
  ['compras', 'Mesa de compras', 'list'],
  ['dashboard', 'Dashboard', 'chart'],
  ['tasar', 'Tasar vehículo', 'list'],
  ['traspasos', 'Traspasos', 'chart'],
];
function currentView() {
  const path = window.location.hash.slice(2);
  if (path === 'mercado') return 'traspasos';
  if (path === 'usados') return 'tasar';
  return path === 'terminos' || path === 'inicio' || tabs.some(([id]) => id === path) ? path : 'dashboard';
}
function navigate(view) {
  window.location.hash = '/' + view;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [contact, setContact] = useState({});
  const [view, setView] = useState(currentView);
  const terms = view === 'terminos';
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    document.title = appName + ' · Talera';
    api('/config').then((config) => setContact(config.contact ?? {})).catch(() => {});
    api('/me').then((result) => setUser(result.user)).catch(() => setUser(null));

    const syncRoute = () => {
      const next = currentView();
      setView(next);
      if (window.location.hash !== '#/' + next) window.history.replaceState(null, '', '#/' + next);
    };
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  async function logout() {
    setLogoutError('');
    try {
      await api('/logout', { method: 'POST' });
      setUser(null);
      navigate('inicio');
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  if (user === undefined) return <div className="login"><div className="spinner" /></div>;
  if (!user && terms) {
    return (
      <div className="login" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ maxWidth: 860 }}>
          <a href="#/inicio">Volver al ingreso</a>
          <h1>Términos de la licencia de uso</h1>
          <TerminosTexto appName={appName} />
        </div>
      </div>
    );
  }
  if (!user) return <Login cfg={{ appName, contact }} onLogin={setUser} />;

  return (
    <div className="shell radar-shell">
      <aside className="side">
        <div className="brand"><img src="/icon.svg" alt="" /><span>{appName}</span></div>
        <a className="powered" href="https://www.talera.co/" target="_blank" rel="noreferrer">
          <span>Powered by</span><img src="/talera-logo.png" alt="Talera" />
        </a>
        {tabs.map(([id, label, icon]) => (
          <button key={id} className={'navbtn' + (view === id ? ' on' : '')} onClick={() => navigate(id)}>
            <Icon name={icon} />{label}
          </button>
        ))}
        <div className="spacer" />
        <button className="navbtn" type="button" onClick={logout}>
          <Icon name="user" />Cerrar sesión
        </button>
        <div className="legal-foot"><a href="#/terminos">Términos de uso</a></div>
      </aside>
      <main className="main">
        {logoutError && <p role="alert">{logoutError}</p>}
        {terms && <Terminos appName={appName} />}
        <div hidden={terms}><Usados view={view} navigate={navigate} /></div>
      </main>
      <nav className="bottomnav" aria-label="Navegación">
        {tabs.map(([id, label, icon]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => navigate(id)}>
            <Icon name={icon} />{label}
          </button>
        ))}
        <button type="button" onClick={logout}><Icon name="user" />Cerrar sesión</button>
      </nav>
    </div>
  );
}





