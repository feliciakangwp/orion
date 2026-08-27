import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { PersonaProvider } from './PersonaContext.tsx';

// HashRouter (not BrowserRouter): GitHub Pages serves static files with no
// server-side rewrite to index.html, so a deep link like /projects/xyz would
// 404 on refresh under a path-based router. Hash routing keeps all
// navigation client-side with zero server configuration.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <PersonaProvider>
        <App />
      </PersonaProvider>
    </HashRouter>
  </StrictMode>
);
