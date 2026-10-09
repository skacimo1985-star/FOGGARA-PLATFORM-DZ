import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import '@fontsource/tajawal/arabic-400.css'
import '@fontsource/tajawal/arabic-500.css'
import '@fontsource/tajawal/arabic-700.css'
import '@fontsource/tajawal/arabic-800.css'
import '@fontsource/hanken-grotesk/latin-400.css'
import '@fontsource/hanken-grotesk/latin-600.css'
import '@fontsource/hanken-grotesk/latin-700.css'
import App from './App.tsx'

// Retire the unversioned offline HTML shell. After a deployment, stale cached
// index.html could keep loading obsolete chunks despite a healthy production API.
// Public pages require a fresh network response; live data is never cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(
        registrations.filter(reg => reg.scope.startsWith(window.location.origin + "/"))
          .map(reg => reg.unregister())
      ))
      .catch(() => {});
    if ("caches" in window) {
      void caches.keys()
        .then(keys => Promise.all(
          keys.filter(key => key.startsWith("foggara-public-shell-"))
            .map(key => caches.delete(key))
        ))
        .catch(() => {});
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
