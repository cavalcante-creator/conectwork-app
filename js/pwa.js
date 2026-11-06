/* Conectwork · app instalável e aviso de conexão.
   1) Registra o service worker (sw.js) para o app abrir sem internet e poder ser instalado.
   2) Mostra a faixa "Você está offline…" enquanto a conexão estiver caída.
   Sem internet nada é enviado ao servidor: o app não finge que algo foi salvo. */
(function () {
  const CW = window.CW = window.CW || {};

  function faixa() {
    const f = document.getElementById('offline'); if (!f) return;
    const off = navigator.onLine === false;
    f.hidden = !off;
    document.documentElement.classList.toggle('sem-rede', off);
  }
  window.addEventListener('online', faixa);
  window.addEventListener('offline', faixa);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', faixa); else faixa();

  /* service worker: só em https ou no próprio computador (o navegador exige) */
  function registrar() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(e => console.warn('Service worker não registrado:', e && e.message || e));
  }
  if (document.readyState === 'complete') registrar(); else window.addEventListener('load', registrar);

  CW.pwa = { offline: () => navigator.onLine === false };
})();
