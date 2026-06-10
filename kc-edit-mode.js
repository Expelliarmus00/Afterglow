/* Load editor-only scripts conditionally. Only runs inside the Omelette editor
   (window.omelette present). NOTE: tweaks-panel.js is NOT loaded here — it
   provides useTweaks/TweaksBase which the page apps depend on at render time,
   so it must load unconditionally on every page. Only the slot uploaders
   (drag-drop image upload behavior) are truly editor-only. */
(function () {
  if (typeof window.omelette !== 'object' || !window.omelette.writeFile) return;
  var s = document.createElement('script');
  s.src = 'kc-slot-uploaders.js';
  s.async = true;
  document.head.appendChild(s);
})();
