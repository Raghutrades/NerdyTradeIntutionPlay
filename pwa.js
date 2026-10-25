/* NerdyTradeIntuition — install prompt + service worker */
(function (N) {
  'use strict';
  let deferred = null, reg = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const btn = document.getElementById('installBtn');
  function showBtn() { if (!standalone() && btn) btn.style.display = ''; }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showBtn(); });
  window.addEventListener('appinstalled', () => { deferred = null; if (btn) btn.style.display = 'none'; N.toast('Installed — find it on your home screen / app list', 'win'); });
  N.promptInstall = async function () {
    if (standalone()) { N.toast('Already running as an installed app', 'info'); return; }
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; return; }
    if (ios) N.toast('iPhone/iPad: tap Share ⬆ then “Add to Home Screen”', 'info');
    else N.toast('Use your browser menu → “Install app” / “Add to Home screen”', 'info');
  };
  if (btn) { btn.onclick = N.promptInstall; if (ios && !standalone()) showBtn(); }
  N.checkUpdate = function () { if (!reg) { N.toast('Updates work once the app is served over https', 'info'); return; } reg.update().then(() => N.toast('Checked — you are on the latest version', 'info')); };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(r => {
        reg = r;
        r.addEventListener('updatefound', () => { const w = r.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) N.toast('Update ready — reload to apply', 'info'); }); });
      }).catch(() => { });
    });
  }
})(window.NTI);
