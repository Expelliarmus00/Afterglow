/* BEGIN USAGE */
/**
 * <image-slot> — user-fillable image placeholder.
 *
 * Drop this into a deck, mockup, or page wherever you want the user to
 * supply an image. You control the slot's shape and size; the user fills it
 * by dragging an image file onto it (or clicking to browse). The dropped
 * image persists across reloads via a .image-slots.state.json sidecar —
 * same read-via-fetch / write-via-window.omelette pattern as
 * design_canvas.jsx, so the filled slot shows on share links, downloaded
 * zips, and PPTX export. Outside the omelette runtime the slot is read-only.
 *
 * The host bridge only allows sidecar writes at the project root, so the
 * HTML that uses this component is assumed to live at the project root too
 * (same constraint as design_canvas.jsx).
 *
 * Attributes:
 *   id           Persistence key. REQUIRED for the drop to survive reload —
 *                every slot on the page needs a distinct id.
 *   shape        'rect' | 'rounded' | 'circle' | 'pill'   (default 'rounded')
 *                'circle' applies 50% border-radius; on a non-square slot
 *                that's an ellipse — set equal width and height for a true
 *                circle.
 *   radius       Corner radius in px for 'rounded'.       (default 12)
 *   mask         Any CSS clip-path value. Overrides `shape` — use this for
 *                hexagons, blobs, arbitrary polygons.
 *   fit          object-fit: cover | contain | fill.       (default 'cover')
 *                With cover (the default) double-clicking the filled slot
 *                enters a reframe mode: the whole image spills past the mask
 *                (translucent outside, opaque inside), drag to reposition,
 *                corner-drag to scale. The crop persists alongside the image
 *                in the sidecar. contain/fill stay static.
 *   position     object-position for fit=contain|fill.     (default '50% 50%')
 *   placeholder  Empty-state caption.                      (default 'Drop an image')
 *   src          Optional initial/fallback image URL. A user drop overrides
 *                it; clearing the drop reveals src again.
 *
 * Size and layout come from ordinary CSS on the element — width/height
 * inline or from a parent grid — so it composes with any layout.
 *
 * Usage:
 *   <image-slot id="hero"   style="width:800px;height:450px" shape="rounded" radius="20"
 *               placeholder="Drop a hero image"></image-slot>
 *   <image-slot id="avatar" style="width:120px;height:120px" shape="circle"></image-slot>
 *   <image-slot id="kite"   style="width:300px;height:300px"
 *               mask="polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"></image-slot>
 */
/* END USAGE */

(() => {
  const STATE_FILE = '.image-slots.state.json';
  // 2× a ~600px slot in a 1920-wide deck — retina-sharp without making the
  // sidecar enormous. A 1200px WebP at q=0.85 is ~150-300KB.
  const MAX_DIM = 1200;
  // Raster formats only. SVG is excluded (can carry script; createImageBitmap
  // on SVG blobs is inconsistent). GIF is excluded because the canvas
  // re-encode keeps only the first frame, so an animated GIF would silently
  // go still — better to reject than surprise.
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  // ── Shared sidecar store ────────────────────────────────────────────────
  // One fetch + immediate write-on-change for every <image-slot> on the
  // page. Reads via fetch() so viewing works anywhere the HTML and sidecar
  // are served together; writes go through window.omelette.writeFile, which
  // the host allowlists to *.state.json basenames only.
  const subs = new Set();
  let slots = {};
  // ids explicitly cleared before the sidecar fetch resolved — otherwise
  // the merge below can't tell "never set" from "just deleted" and would
  // resurrect the sidecar's stale value.
  const tombstones = new Set();
  let loaded = false;
  let loadP = null;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // Merge: sidecar loses to any in-memory change that raced ahead of
        // the fetch (drop or clear) so neither is clobbered by hydration.
        if (j && typeof j === 'object') {
          const merged = Object.assign({}, j, slots);
          // A framing-only write that raced ahead of hydration must not
          // drop a user image that's only on disk — inherit u from the
          // sidecar for any in-memory entry that lacks one.
          for (const k in slots) {
            if (merged[k] && !merged[k].u && j[k]) {
              merged[k].u = typeof j[k] === 'string' ? j[k] : j[k].u;
            }
          }
          for (const id of tombstones) delete merged[id];
          slots = merged;
        }
        tombstones.clear();
      })
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }

  // Serialize writes so two near-simultaneous drops on different slots
  // can't reorder at the backend and leave the sidecar with only the
  // first. A save requested mid-flight just marks dirty and re-fires on
  // completion with the then-current slots.
  let saving = false;
  let saveDirty = false;
  function save() {
    if (saving) { saveDirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(slots)))
      .catch(() => {})
      .then(() => { saving = false; if (saveDirty) { saveDirty = false; save(); } });
  }

  const S_MAX = 5;
  const clampS = (s) => Math.max(1, Math.min(S_MAX, s));

  // Normalize a stored slot value. Pre-reframe sidecars stored a bare
  // data-URL string; newer ones store {u, s, x, y}. Either shape is valid.
  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v, s: 1, x: 0, y: 0 } : v;
  }

  function setSlot(id, val) {
    if (!id) return;
    if (val) { slots[id] = val; tombstones.delete(id); }
    else { delete slots[id]; if (!loaded) tombstones.add(id); }
    subs.forEach((fn) => fn());
    // A drop is rare + high-value — write immediately so nav-away can't lose
    // it. Gate on the initial read so we don't overwrite a sidecar we haven't
    // merged yet; the merge in load() keeps this change once the read lands.
    if (loaded) save(); else load().then(save);
  }

  // ── Image downscale ─────────────────────────────────────────────────────
  // Encode through a canvas so the sidecar carries resized bytes, not the
  // raw upload. Longest side is capped at 2× the slot's rendered width
  // (retina) and at MAX_DIM. WebP keeps alpha and is ~10× smaller than PNG
  // for photos, so there's no need for per-image format picking.
  async function toDataUrl(file, targetW) {
    const bitmap = await createImageBitmap(file);
    try {
      const cap = Math.min(MAX_DIM, Math.max(1, Math.round(targetW * 2)) || MAX_DIM);
      const scale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL('image/webp', 0.85);
    } finally {
      bitmap.close && bitmap.close();
    }
  }

  // ── Custom element ──────────────────────────────────────────────────────
  const stylesheet =
    ':host{display:inline-block;position:relative;vertical-align:top;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55);width:240px;height:160px}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(0,0,0,.04)}' +
    // .frame img (clipped) and .spill (unclipped ghost + handles) share the
    // same left/top/width/height in frame-%, computed by _applyView(), so the
    // inside-mask crop and the outside-mask spill stay pixel-aligned.
    '.frame img{position:absolute;max-width:none;transform:translate(-50%,-50%);' +
    '  -webkit-user-drag:none;user-select:none}' +
    ':host([data-reframe]) .frame img{touch-action:none}' +
    // Reframe mode (double-click): the full image spills past the mask. The
    // spill layer is sized to the IMAGE bounds so its corners are where the
    // resize handles belong. The ghost <img> inside is translucent; the real
    // clipped <img> underneath shows the opaque in-mask crop.
    '.spill{position:absolute;transform:translate(-50%,-50%);display:none;z-index:1;' +
    '  cursor:grab;touch-action:none}' +
    ':host([data-panning]) .spill{cursor:grabbing}' +
    '.spill .ghost{position:absolute;inset:0;width:100%;height:100%;opacity:.35;' +
    '  pointer-events:none;-webkit-user-drag:none;user-select:none;' +
    '  box-shadow:0 0 0 1px rgba(0,0,0,.2),0 12px 32px rgba(0,0,0,.2)}' +
    '.spill .handle{position:absolute;width:12px;height:12px;border-radius:50%;' +
    '  background:#fff;box-shadow:0 0 0 1.5px #c96442,0 1px 3px rgba(0,0,0,.3);' +
    '  transform:translate(-50%,-50%)}' +
    '.spill .handle[data-c=nw]{left:0;top:0;cursor:nwse-resize}' +
    '.spill .handle[data-c=ne]{left:100%;top:0;cursor:nesw-resize}' +
    '.spill .handle[data-c=sw]{left:0;top:100%;cursor:nesw-resize}' +
    '.spill .handle[data-c=se]{left:100%;top:100%;cursor:nwse-resize}' +
    ':host([data-reframe]){z-index:10}' +
    ':host([data-reframe]) .spill{display:block}' +
    ':host([data-reframe]) .frame{box-shadow:0 0 0 2px #c96442}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  cursor:pointer;user-select:none}' +
    '.empty svg{opacity:.45}' +
    '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}' +
    '.empty .sub{font-size:11px}' +
    '.empty .sub u{text-underline-offset:2px;text-decoration-color:rgba(0,0,0,.25)}' +
    '.empty:hover .sub u{color:rgba(0,0,0,.75);text-decoration-color:currentColor}' +
    ':host([data-over]) .frame{outline:2px solid #c96442;outline-offset:-2px;' +
    '  background:rgba(201,100,66,.10)}' +
    '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(0,0,0,.25);' +
    '  transition:border-color .12s}' +
    ':host([data-over]) .ring{border-color:#c96442}' +
    ':host([data-filled]) .ring{display:none}' +
    // Controls sit BELOW the mask (top:100%), absolutely positioned so the
    // author-declared slot height is unaffected. The gap is padding, not a
    // top offset, so the hover target stays contiguous with the frame.
    '.ctl{position:absolute;bottom:8px;right:8px;' +
    '  display:flex;gap:6px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:4;' +
    '  white-space:nowrap}' +
    ':host([data-filled][data-editable]:hover) .ctl,:host([data-reframe]) .ctl' +
    '  {opacity:1;pointer-events:auto}' +
    '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;' +
    '  background:rgba(0,0,0,.65);color:#fff;font:11px/1 system-ui,-apple-system,sans-serif;' +
    '  backdrop-filter:blur(6px)}' +
    '.ctl button:hover{background:rgba(0,0,0,.8)}' +
    '.err{position:absolute;left:8px;bottom:8px;right:8px;color:#b3261e;font-size:11px;' +
    '  background:rgba(255,255,255,.85);padding:4px 6px;border-radius:5px;pointer-events:none}';

  const icon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<path d="m21 15-5-5L5 21"/></svg>';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['shape', 'radius', 'mask', 'fit', 'position', 'placeholder', 'src', 'id', 'loading', 'fetchpriority'];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      // .spill and .ctl sit OUTSIDE .frame so overflow:hidden + border-radius
      // on the frame (circle, pill, rounded) can't clip them.
      root.innerHTML =
        '<style>' + stylesheet + '</style>' +
        '<div class="frame" part="frame">' +
        '  <img part="image" alt="" draggable="false" style="display:none">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div>' +
        '    <div class="sub">or <u>browse files</u></div></div>' +
        '  <div class="ring" part="ring"></div>' +
        '</div>' +
        '<div class="spill">' +
        '  <img class="ghost" alt="" draggable="false">' +
        '  <div class="handle" data-c="nw"></div><div class="handle" data-c="ne"></div>' +
        '  <div class="handle" data-c="sw"></div><div class="handle" data-c="se"></div>' +
        '</div>' +
        '<div class="ctl"><button data-act="replace" title="Replace image">Replace</button>' +
        '  <button data-act="clear" title="Remove image">Remove</button></div>' +
        '<input type="file" accept="' + ACCEPT.join(',') + '" hidden>';
      this._frame = root.querySelector('.frame');
      this._ring = root.querySelector('.ring');
      this._img = root.querySelector('.frame img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._spill = root.querySelector('.spill');
      this._ghost = root.querySelector('.ghost');
      this._err = null;
      this._input = root.querySelector('input');
      this._depth = 0;
      this._gen = 0;
      this._view = { s: 1, x: 0, y: 0 };
      this._subFn = () => this._render();
      // Shadow-DOM listeners live with the shadow DOM — bound once here so
      // disconnect/reconnect (e.g. React remount) doesn't stack handlers.
      this._empty.addEventListener('click', () => this._input.click());
      root.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'replace') { this._exitReframe(true); this._input.click(); }
        if (act === 'clear') {
          this._exitReframe(false);
          this._gen++;
          this._local = null;
          if (this.id) setSlot(this.id, null); else this._render();
        }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
      // naturalWidth/Height aren't known until load — re-apply so the cover
      // baseline is computed from real dimensions, not the 100%×100% fallback.
      this._img.addEventListener('load', () => this._applyView());
      // Gated on editable + fit=cover so share links and contain/fill slots
      // stay static.
      this.addEventListener('dblclick', (e) => {
        if (!this.hasAttribute('data-editable') || !this._reframes()) return;
        e.preventDefault();
        if (this.hasAttribute('data-reframe')) this._exitReframe(true);
        else this._enterReframe();
      });
      // Pan + resize both originate on the spill layer. A handle pointerdown
      // drives an aspect-locked resize anchored at the opposite corner; any
      // other pointerdown on the spill pans. Offsets are frame-% so a
      // reframed slot survives responsive resize / PPTX export.
      this._spill.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        e.stopPropagation();
        this._spill.setPointerCapture(e.pointerId);
        const rect = this.getBoundingClientRect();
        const fw = rect.width || 1, fh = rect.height || 1;
        const corner = e.target.getAttribute && e.target.getAttribute('data-c');
        let move;
        if (corner) {
          // Resize about the OPPOSITE corner. Viewport-px throughout (rect
          // fw/fh, not clientWidth) so the math survives a transform:scale()
          // ancestor — deck_stage renders slides scaled-to-fit.
          const iw = this._img.naturalWidth || 1, ih = this._img.naturalHeight || 1;
          const base = Math.max(fw / iw, fh / ih);
          const sx = corner.includes('e') ? 1 : -1;
          const sy = corner.includes('s') ? 1 : -1;
          const s0 = this._view.s;
          const w0 = iw * base * s0, h0 = ih * base * s0;
          const cx0 = (50 + this._view.x) / 100 * fw;
          const cy0 = (50 + this._view.y) / 100 * fh;
          const ox = cx0 - sx * w0 / 2, oy = cy0 - sy * h0 / 2;
          const diag0 = Math.hypot(w0, h0);
          const ux = sx * w0 / diag0, uy = sy * h0 / diag0;
          move = (ev) => {
            const proj = (ev.clientX - rect.left - ox) * ux +
                         (ev.clientY - rect.top - oy) * uy;
            const s = clampS(s0 * proj / diag0);
            const d = diag0 * s / s0;
            this._view.s = s;
            this._view.x = (ox + ux * d / 2) / fw * 100 - 50;
            this._view.y = (oy + uy * d / 2) / fh * 100 - 50;
            this._clampView();
            this._applyView();
          };
        } else {
          this.setAttribute('data-panning', '');
          const start = { px: e.clientX, py: e.clientY, x: this._view.x, y: this._view.y };
          move = (ev) => {
            this._view.x = start.x + (ev.clientX - start.px) / fw * 100;
            this._view.y = start.y + (ev.clientY - start.py) / fh * 100;
            this._clampView();
            this._applyView();
          };
        }
        const up = () => {
          try { this._spill.releasePointerCapture(e.pointerId); } catch {}
          this._spill.removeEventListener('pointermove', move);
          this._spill.removeEventListener('pointerup', up);
          this._spill.removeEventListener('pointercancel', up);
          this.removeAttribute('data-panning');
          this._dragUp = null;
        };
        // Stashed so _exitReframe (Escape / outside-click mid-drag) can
        // tear the capture + listeners down synchronously.
        this._dragUp = up;
        this._spill.addEventListener('pointermove', move);
        this._spill.addEventListener('pointerup', up);
        this._spill.addEventListener('pointercancel', up);
      });
      // Wheel zoom stays available inside reframe mode as a trackpad nicety —
      // zooms toward the cursor (offset' = cursor·(1-k) + offset·k).
      this.addEventListener('wheel', (e) => {
        if (!this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        const r = this.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width * 100 - 50;
        const cy = (e.clientY - r.top) / r.height * 100 - 50;
        const prev = this._view.s;
        const next = clampS(prev * Math.pow(1.0015, -e.deltaY));
        if (next === prev) return;
        const k = next / prev;
        this._view.s = next;
        this._view.x = cx * (1 - k) + this._view.x * k;
        this._view.y = cy * (1 - k) + this._view.y * k;
        this._clampView();
        this._applyView();
      }, { passive: false });
    }

    connectedCallback() {
      // Warn once per page — an id-less slot works for the session but
      // cannot persist, and two id-less slots would share nothing.
      if (!this.id && !ImageSlot._warned) {
        ImageSlot._warned = true;
        console.warn('<image-slot> without an id will not persist its dropped image.');
      }
      this.addEventListener('dragenter', this);
      this.addEventListener('dragover', this);
      this.addEventListener('dragleave', this);
      this.addEventListener('drop', this);
      subs.add(this._subFn);
      // width%/height% in _applyView encode the frame aspect at call time —
      // a host resize (responsive grid, pane divider) would stretch the
      // image until the next _render. Re-render on size change: _render()
      // re-seeds _view from stored before clamp/apply, so a shrink→grow
      // cycle round-trips instead of ratcheting x/y toward the narrower
      // frame's clamp range.
      this._ro = new ResizeObserver(() => this._render());
      this._ro.observe(this);
      load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('dragenter', this);
      this.removeEventListener('dragover', this);
      this.removeEventListener('dragleave', this);
      this.removeEventListener('drop', this);
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      this._exitReframe(false);
    }

    _enterReframe() {
      if (this.hasAttribute('data-reframe')) return;
      this.setAttribute('data-reframe', '');
      this._applyView();
      // Close on click outside (the spill handler stopPropagation()s so
      // in-image drags don't reach this) and on Escape. Listeners are held
      // on the instance so _exitReframe / disconnectedCallback can detach
      // exactly what was attached.
      this._outside = (e) => {
        if (e.composedPath && e.composedPath().includes(this)) return;
        this._exitReframe(true);
      };
      this._esc = (e) => { if (e.key === 'Escape') this._exitReframe(true); };
      document.addEventListener('pointerdown', this._outside, true);
      document.addEventListener('keydown', this._esc, true);
    }

    _exitReframe(commit) {
      if (!this.hasAttribute('data-reframe')) return;
      if (this._dragUp) this._dragUp();
      this.removeAttribute('data-reframe');
      this.removeAttribute('data-panning');
      if (this._outside) document.removeEventListener('pointerdown', this._outside, true);
      if (this._esc) document.removeEventListener('keydown', this._esc, true);
      this._outside = this._esc = null;
      if (commit) this._commitView();
    }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    // handleEvent — one listener object for all four drag events keeps the
    // add/remove symmetric and the depth counter correct.
    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        // Without preventDefault the browser never fires 'drop'.
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        // dragenter/leave fire for every descendant crossing — count depth
        // so hovering the icon inside the empty state doesn't flicker.
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault();
        e.stopPropagation();
        this._depth = 0;
        this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }

    async _ingest(file) {
      this._setError(null);
      if (!file || ACCEPT.indexOf(file.type) < 0) {
        this._setError('Drop a PNG, JPEG, WebP, or AVIF image.');
        return;
      }
      // toDataUrl can take hundreds of ms on a large photo. A Clear or a
      // newer drop during that window would be clobbered when this await
      // resumes — bump + capture a generation so stale encodes bail.
      const gen = ++this._gen;
      try {
        const w = this.clientWidth || this.offsetWidth || MAX_DIM;
        const url = await toDataUrl(file, w);
        if (gen !== this._gen) return;
        // Only exit reframe once the new image is in hand — a rejected type
        // or decode failure leaves the in-progress crop untouched.
        this._exitReframe(false);
        const val = { u: url, s: 1, x: 0, y: 0 };
        setSlot(this.id || '', val);
        // Keep a session-local copy for id-less slots so the drop still
        // shows, even though it cannot persist.
        if (!this.id) { this._local = val; this._render(); }
      } catch (err) {
        if (gen !== this._gen) return;
        this._setError('Could not read that image.');
        console.warn('<image-slot> ingest failed:', err);
      }
    }

    _setError(msg) {
      if (this._err) { this._err.remove(); this._err = null; }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err'; d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => { if (this._err === d) { d.remove(); this._err = null; } }, 3000);
    }

    // Reframing (pan/resize) is only meaningful for fit=cover — contain/fill
    // keep the old object-fit path and double-click is a no-op.
    _reframes() {
      return this.hasAttribute('data-filled') &&
        (this.getAttribute('fit') || 'cover') === 'cover';
    }

    // Cover-baseline geometry, shared by clamp/apply/resize. Null until the
    // img has loaded (naturalWidth is 0 before that) or when the slot has no
    // layout box — ResizeObserver fires with a 0×0 rect under display:none,
    // and clamping against a degenerate 1×1 frame would silently pull the
    // stored pan toward zero.
    _geom() {
      const iw = this._img.naturalWidth, ih = this._img.naturalHeight;
      const fw = this.clientWidth, fh = this.clientHeight;
      if (!iw || !ih || !fw || !fh) return null;
      return { iw, ih, fw, fh, base: Math.max(fw / iw, fh / ih) };
    }

    _clampView() {
      // Pan range on each axis is half the overflow past the frame edge.
      const g = this._geom();
      if (!g) return;
      const mx = Math.max(0, (g.iw * g.base * this._view.s / g.fw - 1) * 50);
      const my = Math.max(0, (g.ih * g.base * this._view.s / g.fh - 1) * 50);
      this._view.x = Math.max(-mx, Math.min(mx, this._view.x));
      this._view.y = Math.max(-my, Math.min(my, this._view.y));
    }

    _applyView() {
      const g = this._geom();
      const fit = this.getAttribute('fit') || 'cover';
      if (fit !== 'cover' || !g) {
        // Non-cover, or dimensions not known yet (before img load).
        this._img.style.width = '100%';
        this._img.style.height = '100%';
        this._img.style.left = '50%';
        this._img.style.top = '50%';
        this._img.style.objectFit = fit;
        this._img.style.objectPosition = this.getAttribute('position') || '50% 50%';
        return;
      }
      // Cover baseline: img fills the frame on its tighter axis at s=1, so
      // pan works immediately on the overflowing axis without zooming first.
      // Width/height and left/top are all frame-% — depends only on the
      // frame aspect ratio, so a responsive resize keeps the same crop. The
      // spill layer mirrors the same box so its corners = image corners.
      const k = g.base * this._view.s;
      const w = (g.iw * k / g.fw * 100) + '%';
      const h = (g.ih * k / g.fh * 100) + '%';
      const l = (50 + this._view.x) + '%';
      const t = (50 + this._view.y) + '%';
      this._img.style.width = w; this._img.style.height = h;
      this._img.style.left = l; this._img.style.top = t;
      this._img.style.objectFit = '';
      this._spill.style.width = w; this._spill.style.height = h;
      this._spill.style.left = l; this._spill.style.top = t;
    }

    _commitView() {
      const v = { s: this._view.s, x: this._view.x, y: this._view.y };
      if (this._userUrl) v.u = this._userUrl;
      // Framing-only (no u) persists too so an author-src slot remembers its
      // crop; clearing the sidecar still falls through to src=.
      if (this.id) setSlot(this.id, v);
      else { this._local = v; }
    }

    _render() {
      // Shape / mask. Presets use border-radius so the dashed ring can
      // follow the rounded outline; clip-path is only applied for an
      // explicit `mask` (the ring is hidden there since a rectangle
      // dashed border chopped by an arbitrary polygon looks broken).
      const mask = this.getAttribute('mask');
      const shape = (this.getAttribute('shape') || 'rounded').toLowerCase();
      let radius = '';
      if (shape === 'circle') radius = '50%';
      else if (shape === 'pill') radius = '9999px';
      else if (shape === 'rounded') {
        const n = parseFloat(this.getAttribute('radius'));
        radius = (Number.isFinite(n) ? n : 12) + 'px';
      }
      this._frame.style.borderRadius = mask ? '' : radius;
      this._frame.style.clipPath = mask || '';
      this._ring.style.borderRadius = mask ? '' : radius;
      this._ring.style.display = mask ? 'none' : '';

      // Controls and reframe entry gate on this so share links stay read-only.
      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._sub.style.display = editable ? '' : 'none';

      // Content. The sidecar is also writable by the agent's write_file
      // tool, so its value isn't guaranteed canvas-originated — accept only
      // (a) data:image/ URLs or (b) safe same-origin relative paths to an
      // image file (no scheme, no protocol-relative //). This lets the build
      // serve images as cached files instead of inlined base64, while still
      // rejecting arbitrary http(s)/javascript URLs. The `src` attribute is
      // author-controlled (Claude wrote it into the HTML) so it passes through.
      let stored = this.id ? getSlot(this.id) : this._local;
      if (stored && stored.u) {
        const u = stored.u;
        const okData = /^data:image\//i.test(u);
        const okPath = /^(?!\/\/)(?![a-z]+:)[\w./-]+\.(webp|avif|jpe?g|png|gif|svg)$/i.test(u);
        if (!okData && !okPath) stored = null;
      }
      const srcAttr = this.getAttribute('src') || '';
      this._userUrl = (stored && stored.u) || null;
      const url = this._userUrl || srcAttr;
      // Don't clobber an in-flight reframe with a store-triggered re-render.
      if (!this.hasAttribute('data-reframe')) {
        this._view = {
          s: stored && Number.isFinite(stored.s) ? clampS(stored.s) : 1,
          x: stored && Number.isFinite(stored.x) ? stored.x : 0,
          y: stored && Number.isFinite(stored.y) ? stored.y : 0,
        };
      }
      this._cap.textContent = this.getAttribute('placeholder') || 'Drop an image';
      // Toggle via style.display — the [hidden] attribute alone loses to
      // the display:flex / display:block rules in the stylesheet above.
      if (url) {
        if (this._img.getAttribute('src') !== url) {
          this._img.src = url;
          this._ghost.src = url;
        }
        var altText = this.getAttribute('alt') || this.getAttribute('placeholder') || '';
        this._img.alt = altText;
        const loadingVal = this.getAttribute('loading') || 'lazy';
        this._img.setAttribute('loading', loadingVal);
        const fp = this.getAttribute('fetchpriority');
        if (fp) this._img.setAttribute('fetchpriority', fp);
        this._img.setAttribute('decoding', fp === 'high' ? 'sync' : 'async');
        this._img.style.display = 'block';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
        this._clampView();
        this._applyView();
      } else {
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        this._ghost.removeAttribute('src');
        this._empty.style.display = 'flex';
        this.removeAttribute('data-filled');
      }
    }
  }

  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();

;
/* ============================================================
   KEVIN CHINELLI — lightbox
   Click any filled <image-slot> inside a [data-lb-group] container to
   open it full-screen; arrow keys / on-screen arrows navigate the group;
   Esc or backdrop click closes. Reads the slot's rendered <img> (open
   shadow DOM), so it shows whatever image the user dropped.
   Plain JS — loaded on every page after image-slot.js.
   ============================================================ */
(function () {
  var editable = !!(window.omelette && window.omelette.writeFile);
  var overlay, imgEl, counterEl, capEl, group = [], idx = 0, lastFocus = null;

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "kc-lb";
    overlay.innerHTML =
      '<button class="kc-lb-close" aria-label="Fermer">\u00d7</button>' +
      '<button class="kc-lb-nav kc-lb-prev" aria-label="Pr\u00e9c\u00e9dent">\u2190</button>' +
      '<div class="kc-lb-stage"><img alt=""><div class="kc-lb-cap"></div></div>' +
      '<button class="kc-lb-nav kc-lb-next" aria-label="Suivant">\u2192</button>' +
      '<div class="kc-lb-counter"></div>';
    document.body.appendChild(overlay);
    imgEl = overlay.querySelector("img");
    counterEl = overlay.querySelector(".kc-lb-counter");
    capEl = overlay.querySelector(".kc-lb-cap");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Galerie d'images");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.classList.contains("kc-lb-stage")) close();
    });
    overlay.querySelector(".kc-lb-close").addEventListener("click", close);
    overlay.querySelector(".kc-lb-prev").addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
    overlay.querySelector(".kc-lb-next").addEventListener("click", function (e) { e.stopPropagation(); step(1); });
    // touch swipe on the stage
    var sx = 0, sy = 0, tracking = false;
    var stage = overlay.querySelector(".kc-lb-stage");
    stage.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (!tracking) return; tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
      else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) close();
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (!overlay || !overlay.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });
  }

  function caption(slot) {
    return (slot.getAttribute("alt") || slot.getAttribute("placeholder") || "").trim();
  }
  function preload(i) {
    [i - 1, i + 1].forEach(function (n) {
      var s = group[(n + group.length) % group.length];
      if (!s) return;
      var im = slotImg(s);
      if (im && im.src) { var pre = new Image(); pre.src = im.src; }
    });
  }
  function slotImg(slot) {
    return slot.shadowRoot && slot.shadowRoot.querySelector('img[part="image"]');
  }
  function isFilled(slot) { return slot.hasAttribute("data-filled"); }
  function isVisible(slot) { return slot.offsetParent !== null || slot.getClientRects().length > 0; }

  function show(i) {
    idx = (i + group.length) % group.length;
    var im = slotImg(group[idx]);
    imgEl.src = im ? im.src : "";
    var cap = caption(group[idx]);
    imgEl.alt = cap;
    capEl.textContent = cap;
    capEl.style.display = cap ? "" : "none";
    counterEl.textContent = (idx + 1) + " / " + group.length;
    var multi = group.length > 1;
    overlay.querySelector(".kc-lb-prev").style.display = multi ? "" : "none";
    overlay.querySelector(".kc-lb-next").style.display = multi ? "" : "none";
    counterEl.style.display = multi ? "" : "none";
    preload(idx);
  }
  function step(d) {
    imgEl.classList.remove("in");
    show(idx + d);
    requestAnimationFrame(function () { imgEl.classList.add("in"); });
  }

  function open(groupEl, slot) {
    build();
    group = Array.prototype.slice.call(groupEl.querySelectorAll("image-slot")).filter(function (s) {
      return isFilled(s) && isVisible(s);
    });
    if (!group.length) return;
    lastFocus = document.activeElement;
    var start = group.indexOf(slot);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    show(start < 0 ? 0 : start);
    requestAnimationFrame(function () { imgEl.classList.add("in"); });
    var closeBtn = overlay.querySelector(".kc-lb-close");
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove("open");
    imgEl.classList.remove("in");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  var pending = null;
  document.addEventListener("click", function (e) {
    var path = e.composedPath ? e.composedPath() : [];
    // never hijack the image-slot's own edit controls (Replace / Remove)
    for (var i = 0; i < path.length; i++) {
      if (path[i] && path[i].getAttribute && path[i].getAttribute("data-act")) return;
    }
    var slot = null;
    for (var j = 0; j < path.length; j++) {
      if (path[j] && path[j].tagName === "IMAGE-SLOT") { slot = path[j]; break; }
    }
    if (!slot) return;
    var groupEl = slot.closest("[data-lb-group]");
    if (!groupEl) return;
    if (!isFilled(slot)) return;                 // empty → let image-slot open the file browser
    if (slot.hasAttribute("data-reframe")) return;
    if (editable) {
      // wait a beat so a double-click (reframe) cancels the open
      if (pending) { clearTimeout(pending); pending = null; }
      pending = setTimeout(function () { pending = null; open(groupEl, slot); }, 240);
    } else {
      open(groupEl, slot);
    }
  });
  document.addEventListener("dblclick", function () {
    if (pending) { clearTimeout(pending); pending = null; }
  });
})();

;
(()=>{const __TWEAKS_STYLE=`
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;function useTweaks(defaults){const[values,setValues]=React.useState(defaults),setTweak=React.useCallback((keyOrEdits,val)=>{const edits=typeof keyOrEdits=="object"&&keyOrEdits!==null?keyOrEdits:{[keyOrEdits]:val};setValues(prev=>({...prev,...edits})),window.parent.postMessage({type:"__edit_mode_set_keys",edits},"*"),window.dispatchEvent(new CustomEvent("tweakchange",{detail:edits}))},[]);return[values,setTweak]}function TweaksPanel({title="Tweaks",children}){const[open,setOpen]=React.useState(!1),dragRef=React.useRef(null),offsetRef=React.useRef({x:16,y:16}),PAD=16,clampToViewport=React.useCallback(()=>{const panel=dragRef.current;if(!panel)return;const w=panel.offsetWidth,h=panel.offsetHeight,maxRight=Math.max(PAD,window.innerWidth-w-PAD),maxBottom=Math.max(PAD,window.innerHeight-h-PAD);offsetRef.current={x:Math.min(maxRight,Math.max(PAD,offsetRef.current.x)),y:Math.min(maxBottom,Math.max(PAD,offsetRef.current.y))},panel.style.right=offsetRef.current.x+"px",panel.style.bottom=offsetRef.current.y+"px"},[]);React.useEffect(()=>{if(!open)return;if(clampToViewport(),typeof ResizeObserver=="undefined")return window.addEventListener("resize",clampToViewport),()=>window.removeEventListener("resize",clampToViewport);const ro=new ResizeObserver(clampToViewport);return ro.observe(document.documentElement),()=>ro.disconnect()},[open,clampToViewport]),React.useEffect(()=>{const onMsg=e=>{var _a;const t=(_a=e==null?void 0:e.data)==null?void 0:_a.type;t==="__activate_edit_mode"?setOpen(!0):t==="__deactivate_edit_mode"&&setOpen(!1)};return window.addEventListener("message",onMsg),window.parent.postMessage({type:"__edit_mode_available"},"*"),()=>window.removeEventListener("message",onMsg)},[]);const dismiss=()=>{setOpen(!1),window.parent.postMessage({type:"__edit_mode_dismissed"},"*")},onDragStart=e=>{const panel=dragRef.current;if(!panel)return;const r=panel.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,startRight=window.innerWidth-r.right,startBottom=window.innerHeight-r.bottom,move=ev=>{offsetRef.current={x:startRight-(ev.clientX-sx),y:startBottom-(ev.clientY-sy)},clampToViewport()},up=()=>{window.removeEventListener("mousemove",move),window.removeEventListener("mouseup",up)};window.addEventListener("mousemove",move),window.addEventListener("mouseup",up)};return open?React.createElement(React.Fragment,null,React.createElement("style",null,__TWEAKS_STYLE),React.createElement("div",{ref:dragRef,className:"twk-panel","data-omelette-chrome":"",style:{right:offsetRef.current.x,bottom:offsetRef.current.y}},React.createElement("div",{className:"twk-hd",onMouseDown:onDragStart},React.createElement("b",null,title),React.createElement("button",{className:"twk-x","aria-label":"Close tweaks",onMouseDown:e=>e.stopPropagation(),onClick:dismiss},"\u2715")),React.createElement("div",{className:"twk-body"},children))):null}function TweakSection({label,children}){return React.createElement(React.Fragment,null,React.createElement("div",{className:"twk-sect"},label),children)}function TweakRow({label,value,children,inline=!1}){return React.createElement("div",{className:inline?"twk-row twk-row-h":"twk-row"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,label),value!=null&&React.createElement("span",{className:"twk-val"},value)),children)}function TweakSlider({label,value,min=0,max=100,step=1,unit="",onChange}){return React.createElement(TweakRow,{label,value:`${value}${unit}`},React.createElement("input",{type:"range",className:"twk-slider",min,max,step,value,onChange:e=>onChange(Number(e.target.value))}))}function TweakToggle({label,value,onChange}){return React.createElement("div",{className:"twk-row twk-row-h"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,label)),React.createElement("button",{type:"button",className:"twk-toggle","data-on":value?"1":"0",role:"switch","aria-checked":!!value,onClick:()=>onChange(!value)},React.createElement("i",null)))}function TweakRadio({label,value,options,onChange}){var _a;const trackRef=React.useRef(null),[dragging,setDragging]=React.useState(!1),valueRef=React.useRef(value);valueRef.current=value;const labelLen=o=>String(typeof o=="object"?o.label:o).length;if(!(options.reduce((m,o)=>Math.max(m,labelLen(o)),0)<=((_a={2:16,3:10}[options.length])!=null?_a:0))){const resolve=s=>{const m=options.find(o=>String(typeof o=="object"?o.value:o)===s);return m===void 0?s:typeof m=="object"?m.value:m};return React.createElement(TweakSelect,{label,value,options,onChange:s=>onChange(resolve(s))})}const opts=options.map(o=>typeof o=="object"?o:{value:o,label:o}),idx=Math.max(0,opts.findIndex(o=>o.value===value)),n=opts.length,segAt=clientX=>{const r=trackRef.current.getBoundingClientRect(),inner=r.width-4,i=Math.floor((clientX-r.left-2)/inner*n);return opts[Math.max(0,Math.min(n-1,i))].value};return React.createElement(TweakRow,{label},React.createElement("div",{ref:trackRef,role:"radiogroup",onPointerDown:e=>{setDragging(!0);const v0=segAt(e.clientX);v0!==valueRef.current&&onChange(v0);const move=ev=>{if(!trackRef.current)return;const v=segAt(ev.clientX);v!==valueRef.current&&onChange(v)},up=()=>{setDragging(!1),window.removeEventListener("pointermove",move),window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",move),window.addEventListener("pointerup",up)},className:dragging?"twk-seg dragging":"twk-seg"},React.createElement("div",{className:"twk-seg-thumb",style:{left:`calc(2px + ${idx} * (100% - 4px) / ${n})`,width:`calc((100% - 4px) / ${n})`}}),opts.map(o=>React.createElement("button",{key:o.value,type:"button",role:"radio","aria-checked":o.value===value},o.label))))}function TweakSelect({label,value,options,onChange}){return React.createElement(TweakRow,{label},React.createElement("select",{className:"twk-field",value,onChange:e=>onChange(e.target.value)},options.map(o=>{const v=typeof o=="object"?o.value:o,l=typeof o=="object"?o.label:o;return React.createElement("option",{key:v,value:v},l)})))}function TweakText({label,value,placeholder,onChange}){return React.createElement(TweakRow,{label},React.createElement("input",{className:"twk-field",type:"text",value,placeholder,onChange:e=>onChange(e.target.value)}))}function TweakNumber({label,value,min,max,step=1,unit="",onChange}){const clamp=n=>min!=null&&n<min?min:max!=null&&n>max?max:n,startRef=React.useRef({x:0,val:0});return React.createElement("div",{className:"twk-num"},React.createElement("span",{className:"twk-num-lbl",onPointerDown:e=>{e.preventDefault(),startRef.current={x:e.clientX,val:value};const decimals=(String(step).split(".")[1]||"").length,move=ev=>{const dx=ev.clientX-startRef.current.x,raw=startRef.current.val+dx*step,snapped=Math.round(raw/step)*step;onChange(clamp(Number(snapped.toFixed(decimals))))},up=()=>{window.removeEventListener("pointermove",move),window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",move),window.addEventListener("pointerup",up)}},label),React.createElement("input",{type:"number",value,min,max,step,onChange:e=>onChange(clamp(Number(e.target.value)))}),unit&&React.createElement("span",{className:"twk-num-unit"},unit))}function __twkIsLight(hex){const h=String(hex).replace("#",""),x=h.length===3?h.replace(/./g,c=>c+c):h.padEnd(6,"0"),n=parseInt(x.slice(0,6),16);if(Number.isNaN(n))return!0;const r=n>>16&255,g=n>>8&255,b=n&255;return r*299+g*587+b*114>148e3}const __TwkCheck=({light})=>React.createElement("svg",{viewBox:"0 0 14 14","aria-hidden":"true"},React.createElement("path",{d:"M3 7.2 5.8 10 11 4.2",fill:"none",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",stroke:light?"rgba(0,0,0,.78)":"#fff"}));function TweakColor({label,value,options,onChange}){if(!options||!options.length)return React.createElement("div",{className:"twk-row twk-row-h"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,label)),React.createElement("input",{type:"color",className:"twk-swatch",value,onChange:e=>onChange(e.target.value)}));const key=o=>String(JSON.stringify(o)).toLowerCase(),cur=key(value);return React.createElement(TweakRow,{label},React.createElement("div",{className:"twk-chips",role:"radiogroup"},options.map((o,i)=>{const colors=Array.isArray(o)?o:[o],[hero,...rest]=colors,sup=rest.slice(0,4),on=key(o)===cur;return React.createElement("button",{key:i,type:"button",className:"twk-chip",role:"radio","aria-checked":on,"data-on":on?"1":"0","aria-label":colors.join(", "),title:colors.join(" \xB7 "),style:{background:hero},onClick:()=>onChange(o)},sup.length>0&&React.createElement("span",null,sup.map((c,j)=>React.createElement("i",{key:j,style:{background:c}}))),on&&React.createElement(__TwkCheck,{light:__twkIsLight(hero)}))})))}function TweakButton({label,onClick,secondary=!1}){return React.createElement("button",{type:"button",className:secondary?"twk-btn secondary":"twk-btn",onClick},label)}Object.assign(window,{useTweaks,TweaksPanel,TweakSection,TweakRow,TweakSlider,TweakToggle,TweakRadio,TweakSelect,TweakText,TweakNumber,TweakColor,TweakButton});})();

;
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"index.html"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Portraits",short:"Portraits",href:"portraits.html"},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"},{slug:"couple",title:"Couple",short:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",short:"Famille",href:"famille.html"}];function Slot({id,ph,alt,style,className,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title))),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(PRESTA_NAV.some(p=>p.slug===active)?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title)))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"Instagram"),React.createElement("a",{href:"tel:+41764247603"},"+41 76 424 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"))))}function RelatedPresta({current}){const items=PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"rel-"+current+"-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date."}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href:"contact.html",className:"link-arrow reveal d2",style:{fontSize:"14px"}},"Me contacter ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}function TweaksBase({t,setTweak,children}){return React.createElement(TweaksPanel,{title:"Tweaks"},children,React.createElement(TweakSection,{label:"Couleur"}),React.createElement(TweakColor,{label:"Palette",value:t.palette,options:PALETTE_OPTS,onChange:v=>setTweak("palette",v)}),React.createElement(TweakSection,{label:"Typographie"}),React.createElement(TweakRadio,{label:"Titres",value:t.heading,options:["Cinzel","Cormorant"],onChange:v=>setTweak("heading",v)}),React.createElement(TweakRadio,{label:"Texte",value:t.body,options:["Jost","Mulish"],onChange:v=>setTweak("body",v)}))}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,Slot,Overline,Nav,Footer,CtaContact,RelatedPresta,useReveal,useApplyTweaks,TweaksBase});})();

;
/* ============================================================
   KEVIN CHINELLI — contenu des prestations (FR · Suisse romande)
   Plain data, exposed as window.KC_PRESTA[slug].
   Tarifs alignés sur le marché romand (CHF) — ajustables sur devis.
   ============================================================ */
window.KC_PRESTA = {

  /* ====================== MARIAGES ====================== */
  mariage: {
    slug: "mariage", title: "Mariages", crumb: "Mariages", heroDefault: "bas",
    heroImg: "Photo hero — couple, cérémonie en extérieur",
    heroHint: "Photographe de mariage en Suisse romande — du premier regard au dernier éclat de rire.",
    intro: {
      lead: "Un mariage ne se rejoue pas. Mon travail consiste à en garder la trace juste — les gestes, les regards, les fous rires — sans jamais m'interposer entre vous et votre journée.",
      paragraphs: [
        "Je photographie en reportage, à hauteur d'émotion. Concrètement : pas de longue séance de poses qui vous coupe de vos invités, peu de mises en scène, beaucoup d'attention portée aux instants qui passent vite — le regard d'un parent, la main qui tremble pendant les vœux, la piste de danse à minuit. Je prévois une courte parenthèse à deux, à l'heure dorée, pour quelques images plus posées : c'est souvent le seul vrai moment de calme de la journée.",
        "Je travaille en lumière naturelle autant que possible, avec un matériel discret et un second boîtier toujours prêt. Sur les formules avec couverture longue, un second photographe permet de saisir en simultané la mariée et le marié, ou la cérémonie sous deux angles.",
        "Après le jour J, chaque image est triée puis retouchée une à une — colorimétrie, lumière, peau — pour un rendu fidèle et intemporel. Vous recevez une galerie privée à télécharger en pleine résolution, sans filigrane, avec vos droits d'usage privé.",
      ],
      quote: "« Le plus beau des sourires est celui que l'on ne prépare pas. »",
    },
    gallery: [
      { ph: "Préparatifs — détails de la robe", o: "v" },
      { ph: "Regard de la mariée", o: "v" },
      { ph: "Cérémonie — échange des vœux", o: "v" },
      { ph: "Alliances", o: "v" },
      { ph: "Sortie sous les pétales", o: "v" },
      { ph: "Couple — golden hour", o: "h" },
      { ph: "Émotion d'un invité", o: "v" },
      { ph: "Détails du lieu / décor", o: "v" },
      { ph: "Première danse", o: "h" },
      { ph: "Fin de soirée", o: "v" },
    ],
    formules: [
      { tag: "Demi-journée · 4 h", name: "Essentiel", price: "dès CHF 1'690",
        items: ["Couverture 4 h continues — cérémonie & vin d'honneur", "Galerie privée en ligne, téléchargement HD", "Env. 200 photos, toutes retouchées"] },
      { tag: "Le plus choisi · 10 h", name: "Signature", price: "dès CHF 2'990", feature: true,
        items: ["Couverture 10 h, des préparatifs à la soirée", "Séance engagement offerte", "Galerie privée + sélection de favoris", "Env. 500 photos, toutes retouchées"] },
      { tag: "Sur mesure · 2 jours", name: "Prestige", price: "dès CHF 4'500",
        items: ["Présence sur 2 jours (veille / brunch)", "Second photographe", "Séance engagement offerte", "Album fine art relié 30×30", "Tirage fine art — format à votre choix", "Livraison express sous 10 jours"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "Un appel ou un café pour faire connaissance, comprendre votre histoire, votre lieu et vérifier mes disponibilités sur votre date." },
      { n: "02", title: "Repérage & déroulé", text: "On cale ensemble le timing de la journée, les moments à ne pas manquer et, si besoin, on visite les lieux pour anticiper la lumière." },
      { n: "03", title: "Le jour J", text: "Je suis là tôt, en retrait, à l'écoute. Je connais le déroulé par cœur pour saisir l'instant sans jamais avoir à le provoquer." },
      { n: "04", title: "Tri & livraison", text: "Une sélection de 10 photos pour vos réseaux livrée sous 3 à 5 jours. La galerie complète, toutes photos retouchées, est disponible sous 4 semaines (10 jours en formule Prestige)." },
    ],
    inclus: [
      "Appel préparatoire et conseils déroulé", "Repérage des lieux si besoin",
      "Galerie privée en ligne, téléchargement HD", "Toutes les photos livrées retouchées une à une",
      "Sélection réseaux sociaux livrée sous 3–5 jours", "Droits d'usage privé inclus",
      "Double sauvegarde sécurisée pendant 1 an", "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Kevin a capturé notre mariage avec une justesse rare. Chaque image raconte précisément ce que nous avons ressenti ce jour-là.", who: "Camille & Thomas, Lavaux" },
      { quote: "Discret toute la journée, et pourtant rien ne lui a échappé. Nos photos sont d'une élégance folle.", who: "Sophie & Julien, Fribourg" },
    ],
    faq: [
      { q: "Dans quelles régions vous déplacez-vous ?", a: "Je me déplace avec plaisir pour tout mariage en Suisse romande et au-delà. Le déplacement est offert dans un rayon de 30 km autour de Mézières (VD) — ce qui couvre la grande région lausannoise. Pour les principales villes romandes (Lausanne, Genève, Montreux, Fribourg…), un forfait déplacement est intégré directement dans la formule, sans surprise. Pour un mariage à l'étranger, transport et hébergement sont détaillés clairement dans le devis." },
      { q: "Photographiez-vous plusieurs mariages le même jour ?", a: "Jamais. Je ne réserve qu'un seul mariage par date : vous avez ma disponibilité et mon énergie du matin jusqu'à la fin de soirée." },
      { q: "Qu'est-ce qu'une séance d'engagement ?", a: "C'est une séance de couple, incluse dans les formules Signature et Prestige, réalisée quelques semaines ou mois avant le mariage. On se retrouve une petite heure dans un lieu qui vous ressemble pour des photos détendues, rien que vous deux. L'intérêt est double : vous repartez avec de belles images à utiliser pour votre faire-part, votre site de mariage ou un tirage — et surtout, vous prenez vos marques avec ma façon de travailler. Le jour J, l'appareil est déjà familier et vous êtes naturels devant l'objectif." },
      { q: "Combien de photos recevons-nous, et quand ?", a: "Selon la formule, de 200 à 500+ photos — toutes retouchées, en pleine résolution. Ces nombres sont une estimation, pas un engagement contractuel : je tiens avant tout à ce que chaque image soit juste et aboutie. Je cherche la qualité, pas la quantité — selon le déroulé de la journée, certaines galeries dépassent largement ces repères, d'autres les approchent. Vous recevez une sélection de 10 images sous 3 à 5 jours (parfait pour vos réseaux), puis la galerie complète sous 4 semaines (10 jours en formule Prestige)." },
      { q: "Que se passe-t-il s'il pleut ?", a: "On prévoit toujours un plan B avec vous au repérage : un abri couvert, une arche, une grange ou un coin du lieu de réception. La pluie offre souvent les images les plus tendres — parapluie transparent à l'appui." },
      { q: "Proposez-vous un album et des tirages ?", a: "Oui. Albums fine art reliés à la main (papier mat ou brillant, couverture lin ou cuir) et tirages d'art encadrés, sur devis. C'est, de loin, ce qui traverse le mieux les années." },
      { q: "Comment réserver notre date ?", a: "La date est bloquée à la signature du contrat et au versement d'un acompte de 30 %. Le solde est réglé une semaine avant le mariage. Je conseille de réserver 8 à 14 mois à l'avance pour les samedis de mai à septembre." },
    ],
  },

  /* ====================== PORTRAITS ====================== */
  portrait: {
    slug: "portrait", title: "Portraits", crumb: "Portraits", heroDefault: "bas",
    heroImg: "Photo hero — portrait en lumière naturelle, extérieur",
    heroHint: "Photographe portrait en Suisse romande, en lumière naturelle.",
    intro: {
      lead: "Une séance portrait, c'est un cadeau qu'on se fait à soi-même : un temps suspendu, rien que pour vous, et des images qui vous ressemblent vraiment.",
      paragraphs: [
        "On commence par marcher et discuter, le temps que l'appareil se fasse oublier. Je vous donne des indications simples et précises — où poser le regard, quoi faire de vos mains — pour que vous n'ayez jamais à « prendre la pose ». Les plus belles images arrivent presque toujours entre deux consignes, quand vous redevenez tout simplement vous-même.",
        "On repousse si souvent les belles photos de soi à « plus tard » : au bon moment, à quand on sera prêt, à quand on aura le temps. Ce moment, c'est maintenant. S'offrir une séance, c'est s'accorder le droit de se voir autrement, de prendre soin de son image et de garder une trace juste de qui l'on est aujourd'hui.",
        "Je travaille la lumière naturelle, en extérieur ou dans un lieu qui compte pour vous : un quai du Léman à Lausanne, une ruelle de la vieille ville de Genève, votre atelier ou votre intérieur. Portrait personnel, artistique ou pour votre image professionnelle, le cadre s'adapte à l'usage que vous ferez des photos. Vous repartez avec une galerie privée et des fichiers haute définition, prêts pour l'impression comme pour le web.",
      ],
      quote: "« Un visage en dit toujours plus qu'un long discours. »",
    },
    gallery: [
      { ph: "Portrait extérieur — lumière douce", o: "v" },
      { ph: "Regard franc", o: "v" },
      { ph: "Portrait en pied", o: "v" },
      { ph: "Lumière de fin de journée", o: "h" },
      { ph: "Profil — contre-jour", o: "v" },
      { ph: "Attitude lifestyle", o: "v" },
      { ph: "En mouvement", o: "h" },
    ],
    formules: [
      { tag: "Découverte · 30 min", name: "Essentiel", price: "CHF 240",
        items: ["1 lieu extérieur", "10 photos retouchées", "Galerie privée en ligne"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 340", feature: true,
        items: ["2 lieux (intérieur ou extérieur) ou 2 ambiances proches", "25 photos retouchées", "Galerie privée en ligne"] },
      { tag: "Pro & image de marque", name: "Corporate", price: "Sur devis",
        items: ["Portraits pro & personal branding", "Extérieur, intérieur ou studio", "Portraits d'équipe possibles", "Droits d'usage commercial inclus", "Volume & délai selon vos besoins"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On clarifie l'usage des images, l'ambiance recherchée et le lieu qui vous correspond le mieux." },
      { n: "02", title: "Préparation", text: "Conseils tenues, couleurs et repérage : tout est prêt pour que la séance soit fluide et vous ressemble." },
      { n: "03", title: "La séance", text: "Décontractée et guidée. Je vous dirige avec justesse, vous restez vous-même — et on s'amuse." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, fichiers prêts à l'emploi, web et impression." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils lieu, tenues & couleurs", "Direction de pose bienveillante",
      "Toutes les photos livrées retouchées", "Fichiers web et impression HD", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Je me trouve enfin à mon avantage sur une photo. Naturel, juste, sans surjeu.", who: "Sarah, Lausanne" },
      { quote: "Des portraits qui me ressemblent vraiment — je les utilise partout, du site au LinkedIn.", who: "Damien, Genève" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — quais de Lausanne, vieille ville de Genève, vignobles de Lavaux, forêt, bord de lac, ou votre intérieur — ou dans un cadre que je vous propose selon l'ambiance souhaitée. Je me déplace dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et alentours." },
      { q: "Portrait extérieur ou studio, comment choisir ?", a: "Le portrait en extérieur, en lumière naturelle, donne un rendu vivant et personnel. Le studio offre un cadre maîtrisé, idéal pour le corporate et l'éditorial. Si vous hésitez, on en parle : je vous oriente selon l'usage final des images." },
      { q: "Puis-je utiliser les photos pour mon activité ?", a: "Oui. Pour un usage purement personnel, les droits privés sont inclus dans toutes les formules. Pour un usage professionnel ou commercial — site, réseaux, presse, supports imprimés, personal branding, portraits d'équipe — la formule Corporate inclut les droits d'usage commercial et s'établit sur devis selon vos besoins. Dites-moi simplement l'usage prévu, je vous prépare une proposition adaptée." },
      { q: "Combien de tenues puis-je prévoir ?", a: "Une à deux selon la durée. Je vous conseille en amont sur les couleurs et les matières qui rendent le mieux en photo, et qui s'accordent avec le décor." },
      { q: "Je ne suis pas à l'aise devant l'objectif, est-ce un problème ?", a: "C'est le cas de la grande majorité des gens — et c'est précisément mon métier. Je guide pas à pas, sans jamais vous laisser chercher quoi faire. La plupart repartent en se disant que c'était bien plus simple que prévu." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Environ deux semaines, avec une livraison express possible en option si vous en avez besoin plus vite." },
    ],
  },

  /* ============== MATERNITÉ & GROSSESSE ============== */
  maternite: {
    slug: "maternite", title: "Maternité & Grossesse", crumb: "Maternité & Grossesse", heroDefault: "bas",
    heroImg: "Photo hero — silhouette de grossesse, lumière douce",
    heroHint: "Photographe grossesse & maternité en Suisse romande — la douceur de l'attente.",
    intro: {
      lead: "Quelques semaines à peine, et tout change. La grossesse est un moment fragile et magnifique qui mérite d'être célébré, sans précipitation.",
      paragraphs: [
        "La séance se déroule à votre rythme, dans une ambiance calme. En studio chauffé près de chez vous ou en lumière naturelle, je crée des images douces et épurées qui mettent en valeur cette parenthèse — votre silhouette, vos mains, ce lien déjà là. Drapés, tissus fluides et accessoires sont fournis ; vous pouvez aussi venir avec vos propres tenues.",
        "Seule, en couple ou avec vos aînés, la séance s'adapte à votre intimité et à votre confort. Rien n'est imposé : on avance selon ce qui vous met à l'aise.",
        "Si vous le souhaitez, on prolonge l'histoire avec une séance nouveau-né dans les premiers jours du bébé, pour une galerie qui relie l'attente et l'arrivée.",
      ],
      quote: "« Porter la vie est la plus belle des lumières. »",
    },
    gallery: [
      { ph: "Silhouette en contre-jour", o: "v" },
      { ph: "Détail des mains sur le ventre", o: "h" },
      { ph: "Portrait serein", o: "v" },
      { ph: "En couple", o: "v" },
      { ph: "Drapé / tissu fluide", o: "v" },
      { ph: "Lumière de studio", o: "v" },
      { ph: "Avec l'aîné(e)", o: "v" },
      { ph: "Profil — clair-obscur", o: "v" },
      { ph: "Détail intime", o: "h" },
      { ph: "Plein cadre", o: "v" },
    ],
    formules: [
      { tag: "Studio · 1 h", name: "Lumière", price: "CHF 380",
        items: ["Séance 1 h en studio", "1 à 2 tenues / drapés fournis", "Galerie privée en ligne", "20 photos retouchées"] },
      { tag: "Le plus choisi · 1 h 30", name: "Cocon", price: "CHF 590", feature: true,
        items: ["Séance 1 h 30", "Studio ou extérieur", "En couple ou avec les aînés", "40 photos retouchées", "Tirage A5 offert"] },
      { tag: "Histoire complète", name: "Continuité", price: "CHF 980",
        items: ["Séance grossesse", "Séance nouveau-né (10 premiers jours)", "Galerie commune", "60 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur vos envies, le terme prévu et le moment idéal — généralement entre la 30e et la 36e semaine." },
      { n: "02", title: "Préparation", text: "Conseils tenues, drapés et déroulé pour que vous arriviez sereine et confiante." },
      { n: "03", title: "La séance", text: "Un temps doux, sans précipitation, à votre rythme et dans une atmosphère apaisée." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager." },
    ],
    inclus: [
      "Conseils tenues & préparation", "Studio chauffé et équipé", "Drapés et accessoires fournis",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Une bulle de douceur. Je ne me trouvais jamais photogénique enceinte — Kevin m'a fait changer d'avis.", who: "Marie, Vevey" },
      { quote: "Des images d'une finesse incroyable, qui resteront dans la famille pour toujours.", who: "Élodie & Nicolas, Neuchâtel" },
    ],
    faq: [
      { q: "À quel moment de la grossesse réserver ?", a: "Idéalement entre la 30e et la 36e semaine : le ventre est joliment arrondi et vous êtes encore tout à fait à l'aise pour bouger. Pour un terme estival, pensez à réserver dès le 2e trimestre." },
      { q: "Où a lieu la séance en Suisse romande ?", a: "En studio chauffé (adresse communiquée à la réservation) ou en extérieur — bord du Léman, forêt, lieu qui vous est cher — dans le canton de Vaud, à Genève, Fribourg, Neuchâtel ou le Valais romand." },
      { q: "Faut-il prévoir des tenues ?", a: "Je vous guide en amont. Le studio met à disposition drapés, voiles et accessoires, et vous pouvez apporter des tenues près du corps qui vous mettent à l'aise. On prévoit aussi des images en sous-vêtements ou drapé si vous le souhaitez, jamais imposées." },
      { q: "Peut-on faire la séance en couple ou en famille ?", a: "Bien sûr, et c'est très apprécié. La formule Cocon est pensée pour accueillir le ou la partenaire et les aînés." },
      { q: "Proposez-vous des séances nouveau-né ?", a: "Oui, en continuité de la grossesse avec la formule dédiée, idéalement dans les dix premiers jours du bébé, quand il dort encore beaucoup et se love facilement." },
      { q: "La séance est-elle confortable si je suis fatiguée ?", a: "Tout est pensé pour : studio chauffé, pauses libres, durée maîtrisée et aucune posture inconfortable. C'est votre moment, on prend le temps." },
    ],
  },

  /* ====================== STUDIO ====================== */
  studio: {
    slug: "studio", title: "Studio", crumb: "Studio", heroDefault: "bas",
    heroImg: "Photo hero — portrait studio, fond sobre",
    heroHint: "Portrait studio, corporate & éditorial en Suisse romande.",
    intro: {
      lead: "Un portrait fort en dit plus que mille mots. En studio, chaque détail est dirigé — lumière, posture, expression — pour révéler le meilleur de vous.",
      paragraphs: [
        "Portraits corporate, photos d'équipe, images de marque personnelle, portraits éditoriaux : le studio offre un cadre maîtrisé et reproductible. Pratique quand il faut une cohérence visuelle entre plusieurs personnes, ou des images calibrées pour un site, une page LinkedIn ou la presse.",
        "Je dirige la séance pas à pas, j'ajuste la lumière sur chaque visage et je vous montre les images au fur et à mesure pour valider ensemble. Choix des fonds (clair, sombre, coloré), une ou plusieurs tenues, et un rendu net, élégant et intemporel.",
        "Pour les entreprises, je me déplace avec un studio mobile dans vos locaux à Lausanne, Genève ou ailleurs en Suisse romande, afin de photographier toute l'équipe sur place, sans perte de temps.",
      ],
      quote: "« La lumière sculpte, le regard révèle. »",
    },
    gallery: [
      { ph: "Portrait éditorial — clair", o: "v" },
      { ph: "Portrait corporate", o: "v" },
      { ph: "Clair-obscur", o: "v" },
      { ph: "Plan rapproché", o: "h" },
      { ph: "Attitude / posture", o: "v" },
      { ph: "Fond coloré", o: "v" },
      { ph: "Noir & blanc", o: "v" },
      { ph: "Détail / mains", o: "h" },
      { ph: "Portrait de profil", o: "v" },
      { ph: "Plein pied", o: "v" },
    ],
    formules: [
      { tag: "Express · 30 min", name: "Portrait", price: "CHF 220",
        items: ["Séance 30 min", "1 fond, 1 tenue", "Galerie privée", "5 photos retouchées", "Format web + impression"] },
      { tag: "Le plus choisi · 1 h", name: "Éditorial", price: "CHF 420", feature: true,
        items: ["Séance 1 h", "2 fonds, 2 tenues", "Direction artistique", "15 photos retouchées", "Droits web inclus"] },
      { tag: "Équipes & marques", name: "Corporate", price: "dès CHF 1'400",
        items: ["Demi-journée, studio mobile sur site", "Jusqu'à 12 personnes", "Charte visuelle cohérente", "Retouche uniforme", "Livraison express"] },
    ],
    process: [
      { n: "01", title: "Brief", text: "On définit l'usage des images, le style recherché et l'ambiance visuelle — du portrait single au shooting d'équipe." },
      { n: "02", title: "Préparation", text: "Conseils tenues, fonds et lumière, pour un résultat aligné avec votre image ou votre charte." },
      { n: "03", title: "Séance", text: "Direction précise et bienveillante : je vous guide pose après pose et vous montre les images en direct." },
      { n: "04", title: "Sélection & retouche", text: "Tri ensemble, puis retouche soignée et livraison aux formats utiles (web, print, réseaux)." },
    ],
    inclus: [
      "Studio professionnel équipé", "Direction de pose", "Choix des fonds et lumières",
      "Toutes les photos livrées retouchées", "Formats web et impression", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Mes nouveaux portraits corporate ont transformé l'image de mon entreprise. Net, élégant, professionnel.", who: "Antoine, CEO · Genève" },
      { quote: "Kevin met instantanément à l'aise. Je déteste être photographiée — là, j'ai adoré le résultat.", who: "Valérie, Morges" },
    ],
    faq: [
      { q: "Où se trouve le studio ?", a: "En Suisse romande ; l'adresse exacte et l'accès vous sont communiqués à la réservation. Pour les séances d'équipe, je me déplace avec un studio mobile dans vos locaux, à Lausanne, Genève, Fribourg, Neuchâtel ou ailleurs dans la région." },
      { q: "À quoi servent ces portraits ?", a: "Photo de profil LinkedIn, page « équipe » d'un site, dossier de presse, couverture de magazine, image d'auteur ou de conférencier… Dites-moi l'usage final : je calibre le cadrage, le format et le fond en conséquence." },
      { q: "Puis-je venir avec plusieurs tenues ?", a: "Oui. Le nombre dépend de la formule. Je vous conseille sur les associations et les couleurs qui rendent le mieux selon le fond choisi." },
      { q: "Comment se passe une séance corporate pour une équipe ?", a: "J'installe un studio mobile dans une salle de vos locaux. Chaque collaborateur passe 5 à 10 minutes ; je garde la même lumière et le même cadrage pour une galerie parfaitement homogène. Idéal pour une charte visuelle d'entreprise cohérente." },
      { q: "Faites-vous des photos de produits ou de l'événementiel ?", a: "Mon cœur de métier reste le portrait et l'humain. Pour du produit ou de l'événementiel d'entreprise, contactez-moi : selon le projet, je le prends en charge ou vous oriente vers un confrère de confiance." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Une à deux semaines selon la formule, avec une livraison express possible en option pour les besoins urgents." },
    ],
  },

  /* ====================== COUPLE ====================== */
  couple: {
    slug: "couple", title: "Couple", crumb: "Couple", heroDefault: "bas",
    heroImg: "Photo hero — couple complice en extérieur",
    heroHint: "Photographe couple & fiançailles en Suisse romande.",
    intro: {
      lead: "Pas besoin d'une grande occasion pour immortaliser un amour. Une séance couple, c'est du temps offert à votre complicité.",
      paragraphs: [
        "En extérieur ou en atelier, je crée un espace léger où vous pouvez être vous-mêmes. Plutôt que des poses figées, je vous propose des situations — marcher, se chuchoter quelque chose, se taquiner — et je saisis ce qui naît entre deux. Les plus belles images viennent presque toujours d'un rire partagé.",
        "Fiançailles, anniversaire de rencontre, future demande, ou simplement l'envie de garder une trace de cette saison de votre vie : la séance s'adapte à votre histoire et au décor qui vous ressemble — un coucher de soleil sur le Léman, un sentier en forêt, les vignes de Lavaux ou un appartement cosy un dimanche matin.",
        "Vous repartez avec une galerie privée et des fichiers haute définition, parfaits pour un faire-part, un tirage ou simplement pour vous.",
      ],
      quote: "« S'aimer, c'est regarder ensemble dans la même direction. »",
    },
    gallery: [
      { ph: "Marche complice", o: "v" },
      { ph: "Regard partagé", o: "v" },
      { ph: "Étreinte — golden hour", o: "v" },
      { ph: "Détails des mains", o: "v" },
      { ph: "Rire spontané", o: "v" },
      { ph: "Silhouette au coucher du soleil", o: "h" },
      { ph: "En mouvement", o: "v" },
      { ph: "Plan rapproché", o: "v" },
      { ph: "Paysage & couple", o: "h" },
      { ph: "Tendresse", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 45 min", name: "Escapade", price: "CHF 320",
        items: ["Séance 45 min", "1 lieu extérieur", "Galerie privée", "20 photos retouchées"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 520", feature: true,
        items: ["Séance 1 h 30", "2 lieux ou 2 tenues", "Repérage conseillé", "40 photos retouchées", "Tirage A5 offert"] },
      { tag: "Fiançailles · 2 h", name: "Promesse", price: "CHF 850",
        items: ["Séance 2 h", "Extérieur + atelier", "Mini-film souvenir 30 s", "60 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On parle de vous, de votre histoire et de l'ambiance qui vous ressemble." },
      { n: "02", title: "Lieu & tenues", text: "On choisit ensemble un cadre et des tenues à votre image, et on cale l'heure idéale pour la lumière." },
      { n: "03", title: "La séance", text: "Décontractée et joueuse : je vous propose des situations, vous vivez l'instant, je capte le reste." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à partager." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils lieu & tenues", "Direction décontractée",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "On riait tellement qu'on a oublié l'appareil. Les photos sont à notre image : vivantes et vraies.", who: "Inès & Karim, Montreux" },
      { quote: "Le cadeau de fiançailles parfait. On a hâte de retravailler avec Kevin pour le mariage.", who: "Laura & Maxime, Sion" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — rives du Léman, vignobles de Lavaux, vieille ville, forêt ou votre intérieur — ou dans un cadre que je vous propose. Je me déplace dans le canton de Vaud, à Genève, Fribourg, Neuchâtel, en Valais romand et alentours." },
      { q: "Quel est le meilleur moment de la journée ?", a: "L'heure dorée, juste avant le coucher du soleil : la lumière y est chaude et flatteuse. On peut aussi profiter d'une lumière matinale, plus calme et plus fraîche, selon le lieu." },
      { q: "Et s'il pleut le jour J ?", a: "On reporte sans frais à une date proche, ou on bascule en atelier pour une séance plus intimiste. La météo romande étant ce qu'elle est, on garde toujours une porte de sortie." },
      { q: "Combien de temps dure une séance ?", a: "De 45 minutes à 2 heures selon la formule — le temps de se détendre, d'oublier l'objectif et de profiter l'un de l'autre." },
      { q: "Peut-on l'offrir en cadeau ?", a: "Oui, je propose des bons cadeaux personnalisés, valables un an. Une belle idée pour une demande, un anniversaire ou les fêtes." },
      { q: "On veut s'en servir pour notre faire-part de mariage, c'est possible ?", a: "Bien sûr. Beaucoup de couples font leur séance couple ou fiançailles quelques mois avant le mariage, pour le faire-part et le site. C'est aussi un excellent moyen de se familiariser avec ma façon de travailler avant le jour J." },
    ],
  },

  /* ====================== FAMILLE ====================== */
  famille: {
    slug: "famille", title: "Famille", crumb: "Famille", heroDefault: "bas",
    heroImg: "Photo hero — famille complice en extérieur, lumière dorée",
    heroHint: "Photographe de famille en Suisse romande — des images vraies, sans poses figées.",
    intro: {
      lead: "Les enfants grandissent vite, et les vraies images de famille — celles où tout le monde rit pour de bon — sont les plus précieuses. Mon rôle : capter votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Oubliez le « tout le monde regarde l'objectif et sourit ». Je crée une parenthèse de jeu et de complicité — on marche, on se chamaille, on se câline — et je saisis les regards, les fous rires et les gestes tendres entre deux. Les enfants restent eux-mêmes, et les images vous ressemblent vraiment.",
        "En extérieur et en lumière naturelle — au bord du Léman, en forêt, dans les vignes de Lavaux — ou chez vous, dans votre cocon, pour des images intimes du quotidien. La séance s'adapte à l'âge des enfants et à votre rythme : on prend le temps qu'il faut, sans pression.",
        "Séance famille classique, arrivée d'un nouveau-né, séance multigénérationnelle avec les grands-parents, ou rendez-vous annuel pour suivre la tribu qui grandit : on construit la séance autour de votre histoire.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    gallery: [
      { ph: "Famille complice en extérieur", o: "h" },
      { ph: "Fou rire d'enfant", o: "v" },
      { ph: "Câlin parent-enfant", o: "v" },
      { ph: "Course dans l'herbe", o: "h" },
      { ph: "Détail — petites mains", o: "v" },
      { ph: "Portrait de fratrie", o: "v" },
      { ph: "Tendresse à contre-jour", o: "v" },
      { ph: "Trois générations réunies", o: "v" },
      { ph: "Jeu à l'heure dorée", o: "v" },
      { ph: "Instant du quotidien", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 1 h", name: "Tribu", price: "CHF 390",
        items: ["Séance 1 h en extérieur", "1 lieu en Suisse romande", "Galerie privée en ligne", "20 photos retouchées", "Fichiers web + impression"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 590", feature: true,
        items: ["Séance 1 h 30", "Extérieur ou à domicile", "Jusqu'à 6 personnes", "35 photos retouchées", "Tirage A4 offert"] },
      { tag: "Multigénération · 2 h", name: "Tribu élargie", price: "CHF 890",
        items: ["Séance 2 h", "Jusqu'à 12 personnes (grands-parents inclus)", "2 lieux ou 2 ambiances", "50 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur votre famille, l'âge des enfants, l'ambiance et le lieu qui vous ressemblent." },
      { n: "02", title: "Préparation", text: "Conseils tenues et couleurs accordées, choix du lieu et de l'horaire idéal selon l'âge des plus petits." },
      { n: "03", title: "La séance", text: "Du jeu, pas de poses figées. Je guide en douceur, au rythme des enfants — et on s'amuse pour de vrai." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager avec toute la famille." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils tenues & couleurs accordées", "Séance en extérieur ou à domicile",
      "Direction bienveillante, au rythme des enfants", "Toutes les photos livrées retouchées", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Les premières photos de famille où nos enfants sont vraiment eux-mêmes. On rit à chaque fois qu'on les regarde.", who: "Famille Rochat, Lausanne" },
      { quote: "Kevin a réuni trois générations avec une facilité déconcertante. Un souvenir inestimable pour nous tous.", who: "Famille Pereira, Fribourg" },
    ],
    faq: [
      { q: "À partir de quel âge photographier les enfants ?", a: "À tout âge — du nouveau-né aux adolescents. Pour les bébés, on privilégie les dix premiers jours ou la période après 6 mois (quand ils tiennent assis). Pour les plus grands, la séance se transforme en jeu : c'est souvent là que naissent les plus belles images." },
      { q: "Où se déroule la séance photo de famille ?", a: "Au lieu de votre choix — bord du Léman, forêt, vignes de Lavaux, parc — ou à votre domicile pour des images intimes du quotidien. Le déplacement est offert dans un rayon de 30 km autour de Mézières (VD). Au-delà, un supplément est prévu selon l'endroit." },
      { q: "Comment ça se passe avec des enfants en bas âge ou agités ?", a: "C'est tout l'intérêt du reportage : je ne cherche pas à les figer. On joue, on bouge, on fait des pauses goûter si besoin. Je m'adapte à leur rythme et à leur humeur — les enfants qui « ne tiennent pas en place » donnent souvent les photos les plus vivantes." },
      { q: "Peut-on faire une séance avec les grands-parents ?", a: "Oui, et c'est très demandé. La formule Tribu élargie est pensée pour les séances multigénérationnelles, jusqu'à douze personnes — un magnifique cadeau pour réunir toute la famille autour d'images qui restent." },
      { q: "Que porter pour une séance photo de famille ?", a: "Des tenues coordonnées, sans être assorties à l'identique : une palette de 2 ou 3 couleurs douces et naturelles fonctionne très bien. Évitez les gros logos et les motifs chargés. Je vous envoie des conseils personnalisés avant la séance." },
      { q: "Sous quel délai les photos sont-elles livrées ?", a: "Environ deux semaines, dans une galerie privée en ligne, en haute définition pour l'impression comme pour le partage. Une livraison express est possible en option." },
    ],
  },
};

;
(()=>{const{useState}=React,PRESTA_OPTS=window.PRESTA_NAV,Q=new URLSearchParams(window.location.search),TYPES=[{key:"Mariage",href:"mariages.html"},{key:"Portrait",href:"portraits.html"},{key:"Studio",href:"studio.html"},{key:"Maternit\xE9 & Grossesse",href:"maternite-grossesse.html"},{key:"Couple",href:"couple.html"},{key:"Famille",href:"famille.html"},{key:"Bon cadeau",href:""},{key:"Autre",href:""}],FORMULES={Mariage:[{name:"Essentiel \u2014 6 h",price:"CHF 1'690"},{name:"Signature \u2014 10 h",price:"CHF 2'690"},{name:"Prestige \u2014 2 jours",price:"d\xE8s CHF 4'500"},{name:"Je ne sais pas encore",price:""}],Portrait:[{name:"Signature \u2014 45 min",price:"CHF 320"},{name:"Lumi\xE8re \u2014 1 h 30",price:"CHF 520"},{name:"Pr\xE9sence \u2014 2 h (pro)",price:"CHF 850"},{name:"Je ne sais pas encore",price:""}],Studio:[{name:"Portrait \u2014 30 min",price:"CHF 220"},{name:"\xC9ditorial \u2014 1 h",price:"CHF 420"},{name:"Corporate \u2014 \xE9quipe",price:"d\xE8s CHF 1'400"},{name:"Je ne sais pas encore",price:""}],"Maternit\xE9 & Grossesse":[{name:"Lumi\xE8re \u2014 1 h studio",price:"CHF 380"},{name:"Cocon \u2014 1 h 30",price:"CHF 590"},{name:"Continuit\xE9 \u2014 grossesse + nouveau-n\xE9",price:"CHF 980"},{name:"Je ne sais pas encore",price:""}],Couple:[{name:"Escapade \u2014 45 min",price:"CHF 320"},{name:"Complices \u2014 1 h 30",price:"CHF 520"},{name:"Promesse \u2014 fian\xE7ailles 2 h",price:"CHF 850"},{name:"Je ne sais pas encore",price:""}],Famille:[{name:"Tribu \u2014 1 h",price:"CHF 390"},{name:"Complices \u2014 1 h 30",price:"CHF 590"},{name:"Tribu \xE9largie \u2014 2 h",price:"CHF 890"},{name:"Je ne sais pas encore",price:""}]},REGIONS=["Vaud / Lausanne","Gen\xE8ve","Fribourg","Neuch\xE2tel","Valais","Riviera / Montreux","Autre / \xE0 d\xE9finir"];function normType(v){if(!v)return"";const hit=TYPES.find(t=>t.key.toLowerCase()===v.toLowerCase()||t.key.toLowerCase().startsWith(v.toLowerCase()));return hit?hit.key:v}function ContactApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});useApplyTweaks(t);const[step,setStep]=useState(0),[sent,setSent]=useState(!1),[sending,setSending]=useState(!1),[sendError,setSendError]=useState(""),[err,setErr]=useState({}),[a,setA]=useState({type:normType(Q.get("type")||""),formule:"",date:Q.get("date")||"",region:"",nom:"",email:"",tel:"",message:"",website:""});useReveal([step,sent]);const set=(k,v)=>setA(s=>({...s,[k]:v})),hasFormules=!!FORMULES[a.type],STEPS=["Prestation",hasFormules?"Formule":null,"Date & lieu","Coordonn\xE9es","R\xE9capitulatif"].filter(Boolean),validateStep=i=>{const e={},label2=STEPS[i];return label2==="Prestation"&&!a.type&&(e.type="Choisissez une prestation."),label2==="Coordonn\xE9es"&&(a.nom.trim()||(e.nom="Indiquez votre nom."),/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)||(e.email="Adresse email invalide.")),setErr(e),Object.keys(e).length===0},next=()=>{validateStep(step)&&setStep(s=>Math.min(s+1,STEPS.length-1))},back=()=>setStep(s=>Math.max(s-1,0)),submit=async()=>{setSending(!0),setSendError("");try{const res=await fetch("contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)}),j=await res.json().catch(()=>({}));res.ok&&j&&j.ok?setSent(!0):res.status===429?setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis r\xE9essayez."):setSendError("Une erreur est survenue \xE0 l'envoi. R\xE9essayez, ou \xE9crivez-moi directement \xE0 contact@afterglowbykevin.ch.")}catch{setSendError("Connexion impossible. V\xE9rifiez votre r\xE9seau, ou \xE9crivez-moi \xE0 contact@afterglowbykevin.ch.")}finally{setSending(!1)}},label=STEPS[step],estimate=hasFormules&&a.formule?(FORMULES[a.type].find(f=>f.name===a.formule)||{}).price:"";return React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:"contact"}),React.createElement("main",null,React.createElement("section",{className:"sec s-dark contact-page",style:{paddingTop:"clamp(140px,15vw,210px)",paddingBottom:"clamp(80px,11vw,150px)"}},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{marginBottom:"clamp(34px,5vw,56px)",textAlign:"center"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Parlons de votre projet"),React.createElement("h1",{className:"display reveal d1",style:{fontSize:"clamp(36px,5.4vw,72px)",marginTop:"18px"}},"Demandez votre devis.")),sent?React.createElement("div",{className:"form-sent reveal",style:{margin:"0 auto",maxWidth:"560px"}},React.createElement("div",{className:"fs-mark"},"\u2713"),React.createElement("h3",null,"Merci, votre demande est bien partie."),React.createElement("p",null,"Je l'ai bien re\xE7ue et je vous r\xE9ponds personnellement sous 48\xA0h ouvr\xE9es. \xC0 tr\xE8s vite\xA0!"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch",className:"link-arrow"},"contact@afterglowbykevin.ch ",React.createElement("span",{className:"ar"},"\u2192"))):React.createElement("div",{className:"funnel reveal"},React.createElement("div",{className:"fn-steps",role:"list"},STEPS.map((s,i)=>React.createElement("div",{key:s,className:"fn-step"+(i===step?" current":"")+(i<step?" done":""),role:"listitem"},React.createElement("span",{className:"fn-num"},i<step?"\u2713":i+1),React.createElement("span",{className:"fn-lbl"},s)))),React.createElement("div",{className:"fn-panel"},label==="Prestation"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Quel type de s\xE9ance vous int\xE9resse\xA0?"),React.createElement("div",{className:"fn-grid"},TYPES.map(ty=>React.createElement("button",{key:ty.key,type:"button",className:"fn-opt"+(a.type===ty.key?" sel":""),onClick:()=>{set("type",ty.key),set("formule","")}},ty.key))),err.type&&React.createElement("span",{className:"field-err"},err.type)),label==="Formule"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Une formule en t\xEAte\xA0? ",React.createElement("span",{className:"fn-q-sub"},"(indicatif \u2014 ajustable sur devis)")),React.createElement("div",{className:"fn-list"},FORMULES[a.type].map(f=>React.createElement("button",{key:f.name,type:"button",className:"fn-row"+(a.formule===f.name?" sel":""),onClick:()=>set("formule",f.name)},React.createElement("span",null,f.name),f.price&&React.createElement("span",{className:"fn-price"},f.price))))),label==="Date & lieu"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Quand et o\xF9\xA0?"),React.createElement("div",{className:"field"},React.createElement("label",null,"Date envisag\xE9e"),React.createElement("input",{className:"control",type:"date",value:a.date,onChange:e=>set("date",e.target.value)})),React.createElement("div",{className:"field"},React.createElement("label",null,"Lieu / r\xE9gion"),React.createElement("select",{className:"control",value:a.region,onChange:e=>set("region",e.target.value)},React.createElement("option",{value:""},"S\xE9lectionner"),REGIONS.map(r=>React.createElement("option",{key:r,value:r},r))))),label==="Coordonn\xE9es"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"Comment vous joindre\xA0?"),React.createElement("div",{className:"field-row"},React.createElement("div",{className:"field"+(err.nom?" error":"")},React.createElement("label",null,"Nom"),React.createElement("input",{className:"control",type:"text",value:a.nom,onChange:e=>set("nom",e.target.value),placeholder:"Votre nom"}),err.nom&&React.createElement("span",{className:"field-err"},err.nom)),React.createElement("div",{className:"field"+(err.email?" error":"")},React.createElement("label",null,"Email"),React.createElement("input",{className:"control",type:"email",value:a.email,onChange:e=>set("email",e.target.value),placeholder:"vous@email.com"}),err.email&&React.createElement("span",{className:"field-err"},err.email))),React.createElement("div",{className:"field"},React.createElement("label",null,"T\xE9l\xE9phone ",React.createElement("span",{className:"opt"},"(facultatif)")),React.createElement("input",{className:"control",type:"tel",value:a.tel,onChange:e=>set("tel",e.target.value),placeholder:"+41 \u2026"})),React.createElement("div",{className:"field"},React.createElement("label",null,"Votre message ",React.createElement("span",{className:"opt"},"(facultatif)")),React.createElement("textarea",{className:"control",rows:"4",value:a.message,onChange:e=>set("message",e.target.value),placeholder:"Le lieu, l'ambiance souhait\xE9e, vos questions\u2026"})),React.createElement("input",{type:"text",name:"website",tabIndex:"-1",autoComplete:"off","aria-hidden":"true",value:a.website,onChange:e=>set("website",e.target.value),style:{position:"absolute",left:"-9999px",width:"1px",height:"1px",opacity:0}})),label==="R\xE9capitulatif"&&React.createElement("div",{className:"fn-body"},React.createElement("h2",{className:"fn-q"},"On y est. Un dernier coup d'\u0153il\xA0:"),React.createElement("dl",{className:"fn-recap"},React.createElement("div",null,React.createElement("dt",null,"Prestation"),React.createElement("dd",null,a.type||"\u2014")),hasFormules&&React.createElement("div",null,React.createElement("dt",null,"Formule"),React.createElement("dd",null,a.formule||"\u2014",estimate?" \xB7 "+estimate:"")),React.createElement("div",null,React.createElement("dt",null,"Date"),React.createElement("dd",null,a.date||"\xE0 d\xE9finir")),React.createElement("div",null,React.createElement("dt",null,"Lieu"),React.createElement("dd",null,a.region||"\xE0 d\xE9finir")),React.createElement("div",null,React.createElement("dt",null,"Nom"),React.createElement("dd",null,a.nom||"\u2014")),React.createElement("div",null,React.createElement("dt",null,"Email"),React.createElement("dd",null,a.email||"\u2014")),a.tel&&React.createElement("div",null,React.createElement("dt",null,"T\xE9l\xE9phone"),React.createElement("dd",null,a.tel))),React.createElement("p",{className:"fn-note"},"En envoyant, votre demande m'est transmise directement. Je vous r\xE9ponds personnellement sous 48\xA0h.")),sendError&&React.createElement("p",{className:"field-err",style:{textAlign:"center",marginBottom:"12px"}},sendError),React.createElement("div",{className:"fn-actions"},step>0?React.createElement("button",{type:"button",className:"fn-back",onClick:back},"\u2190 Retour"):React.createElement("span",null),label==="R\xE9capitulatif"?React.createElement("button",{type:"button",className:"dc-btn fn-send",onClick:submit,disabled:sending},sending?"Envoi\u2026":"Envoyer ma demande"," ",React.createElement("span",{className:"ar"},"\u2192")):React.createElement("button",{type:"button",className:"dc-btn",onClick:next},"Continuer ",React.createElement("span",{className:"ar"},"\u2192"))))),React.createElement("div",{className:"fn-aside reveal d1"},React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("a",{href:"tel:+41764247603"},"+41 76 424 76 03"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"@afterglowbykevin"),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("span",null,"R\xE9ponse sous 48 h"))))),React.createElement(Footer,null),React.createElement(TweaksBase,{t,setTweak}))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ContactApp,null));})();

;
/* ============================================================
   KEVIN CHINELLI — polish & accessibility
   • Skip link (a11y)  • subtle parallax on static heroes
   • tasteful "Voir" cursor over zoomable gallery images
   Vanilla, every page. All effects respect prefers-reduced-motion.
   ============================================================ */
(function () {
  if (window.__kcPolish) return; window.__kcPolish = true;
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var finePointer = false;
  try { finePointer = matchMedia("(pointer: fine)").matches; } catch (e) {}

  /* ---------- skip link ---------- */
  function addSkip() {
    if (document.querySelector(".skip-link")) return true;
    var main = document.querySelector("main");
    if (!main) return false;
    if (!main.id) main.id = "contenu";
    main.setAttribute("tabindex", "-1");
    var a = document.createElement("a");
    a.className = "skip-link";
    a.href = "#" + main.id;
    a.textContent = "Aller au contenu";
    document.body.insertBefore(a, document.body.firstChild);
    return true;
  }

  /* ---------- parallax (static heroes only; NOT the home carousel) ---------- */
  function initParallax() {
    if (reduce) return false;
    var targets = [].slice.call(document.querySelectorAll(".phero .bg, .art-hero .bg, .ap-hero .portrait"));
    if (!targets.length) return false;
    targets.forEach(function (t) { t.style.willChange = "transform"; t.style.transform = "scale(1.12)"; });
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      targets.forEach(function (t) {
        var off = Math.max(-70, Math.min(70, y * 0.12));
        t.style.transform = "translate3d(0," + off + "px,0) scale(1.12)";
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
    return true;
  }

  /* ---------- "Voir" cursor over zoomable gallery images ---------- */
  function initCursor() {
    if (reduce || !finePointer) return;
    var dot = document.createElement("div");
    dot.className = "kc-cursor";
    dot.innerHTML = '<span>Voir</span>';
    document.body.appendChild(dot);
    var x = 0, y = 0, raf = null;
    function move(e) {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = null;
        dot.style.transform = "translate(" + (x - 1) + "px," + (y - 1) + "px)";
      });
    }
    function over(e) {
      var p = e.composedPath ? e.composedPath() : [];
      var hit = false;
      for (var i = 0; i < p.length; i++) {
        var el = p[i];
        if (el && el.tagName === "IMAGE-SLOT" && el.hasAttribute("data-filled") &&
            el.closest && el.closest("[data-lb-group]") && !el.hasAttribute("data-reframe")) { hit = true; break; }
      }
      dot.classList.toggle("on", hit);
    }
    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseover", over, { passive: true });
    document.addEventListener("mouseleave", function () { dot.classList.remove("on"); });
  }

  function init() {
    initCursor();
    // React apps mount async (Babel) — retry skip link + parallax until <main> exists.
    var tries = 0;
    var state = { skip: false, par: reduce };
    (function tick() {
      if (!state.skip) state.skip = addSkip();
      if (!state.par) state.par = initParallax();
      tries++;
      if ((!state.skip || !state.par) && tries < 40) setTimeout(tick, 120);
    })();
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();

;
/* ============================================================
   KEVIN CHINELLI — page transitions
   JS fade-out on internal navigation + fade-in on load (universal,
   respects prefers-reduced-motion). Plain <script>, no dependencies.
   ============================================================ */
(function () {
  var html = document.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A skipped View Transition (e.g. when a navigation is interrupted) rejects a
  // promise that is otherwise harmless; keep it from spamming the console.
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = (r && (r.message || r)) + "";
    if (/Transition was skipped/i.test(msg)) e.preventDefault();
  });

  // Always clear a stale "leaving" state (e.g. when restored from bfcache).
  window.addEventListener("pageshow", function () {
    document.body && document.body.classList.remove("is-leaving");
  });

  if (reduce) return; // honour reduced motion — no fades

  // Fade the page in on load…
  html.classList.add("kc-anim-pages");

  // …and fade out before following an internal link.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    var raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") return;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;

    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    // same page, just a hash → let the browser scroll
    if (url.pathname === location.pathname && url.hash) return;

    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(function () { location.href = a.href; }, 300);
  });
})();

;
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
