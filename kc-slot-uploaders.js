/* ============================================================
   KEVIN CHINELLI — aide à l'upload des placeholders
   Ajoute un bouton « Charger » flottant, ancré en bas de chaque
   <image-slot>, AU-DESSUS de tout contenu (utile quand le slot est
   en arrière-plan, sous du texte — ex. le hero).

   Visible UNIQUEMENT en mode édition (window.omelette.writeFile).
   Sur le site déployé (pas d'omelette), aucun bouton n'apparaît.
   Vanilla, chargé sur chaque page.
   ============================================================ */
(function () {
  if (window.__kcSlotUp) return; window.__kcSlotUp = true;

  function isEditable() { return !!(window.omelette && window.omelette.writeFile); }

  /* styles */
  var css =
    '.kc-slot-up{position:fixed;z-index:870;transform:translate(-50%,-100%);' +
    '  display:inline-flex;align-items:center;gap:7px;cursor:pointer;' +
    '  background:rgba(15,13,11,.82);color:#fff;border:1px solid rgba(255,255,255,.22);' +
    '  border-radius:999px;padding:8px 15px;font:600 11px/1 system-ui,-apple-system,sans-serif;' +
    '  letter-spacing:.05em;backdrop-filter:blur(8px);box-shadow:0 6px 22px rgba(0,0,0,.4);' +
    '  transition:background .2s,border-color .2s,transform .12s}' +
    '.kc-slot-up:hover{background:var(--accent,#b9926b);border-color:var(--accent,#b9926b);color:#141210}' +
    '.kc-slot-up:active{transform:translate(-50%,-100%) scale(.96)}' +
    '.kc-slot-up svg{display:block;flex:0 0 auto}' +
    '@media print{.kc-slot-up{display:none !important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 19h14"/></svg>';

  var MAP = new Map(); // image-slot -> button

  function fileInput(slot) {
    return slot.shadowRoot && slot.shadowRoot.querySelector('input[type=file]');
  }

  function makeBtn(slot) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kc-slot-up';
    b.innerHTML = ICON + '<span></span>';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var inp = fileInput(slot);
      if (inp) inp.click();
    });
    document.body.appendChild(b);
    return b;
  }

  function sync() {
    var ed = isEditable();
    if (!ed) { MAP.forEach(function (b) { b.style.display = 'none'; }); return; }

    var slots = document.querySelectorAll('image-slot');
    slots.forEach(function (s) { if (!MAP.has(s)) MAP.set(s, makeBtn(s)); });
    MAP.forEach(function (b, s) { if (!s.isConnected) { b.remove(); MAP.delete(s); } });

    var vw = window.innerWidth, vh = window.innerHeight;
    MAP.forEach(function (b, s) {
      var r = s.getBoundingClientRect();
      var onScreen = r.bottom > 44 && r.top < vh - 8 && r.right > 8 && r.left < vw - 8 &&
                     r.width > 44 && r.height > 44;
      if (!onScreen) { b.style.display = 'none'; return; }
      b.style.display = 'inline-flex';
      b.querySelector('span').textContent = s.hasAttribute('data-filled') ? 'Remplacer' : 'Charger une photo';
      var cx = Math.min(vw - 14, Math.max(14, r.left + r.width / 2));
      var by = Math.min(vh - 10, r.bottom - 12);
      b.style.left = cx + 'px';
      b.style.top = by + 'px';
    });
  }

  var raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; sync(); }); }

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  try {
    var mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-filled', 'class', 'style'] });
  } catch (e) {}

  // React mounts async (Babel) + omelette may inject late. rAF can be frozen
  // when the iframe is offscreen, so the timer calls sync() DIRECTLY (not via
  // rAF) to guarantee the buttons appear regardless of visibility.
  var n = 0, iv = setInterval(function () { try { sync(); } catch (e) {} if (++n > 60) clearInterval(iv); }, 400);
  if (document.readyState !== 'loading') sync();
  else document.addEventListener('DOMContentLoaded', sync);
})();
