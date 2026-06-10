/* Load editor-only scripts conditionally: tweaks-panel + slot uploaders.
   Only runs if window.omelette is present (inside the Omelette editor). */
(function () {
  if (typeof window.omelette !== 'object' || !window.omelette.writeFile) return;
  // Load tweaks panel + slot uploaders
  ['tweaks-panel.js', 'kc-slot-uploaders.js'].forEach(function (src) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  });
})();
