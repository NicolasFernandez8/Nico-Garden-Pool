import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { aplicarTema } from './components/Tema';
import './styles.css';

try { aplicarTema(localStorage.getItem('ngp-tema') || 'dark'); } catch { aplicarTema('dark'); }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
