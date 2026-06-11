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
(()=>{const{useState,useEffect,useRef}=React,PALETTES={"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},PALETTE_OPTS=Object.values(PALETTES),HEAD_FONTS={Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS={Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},TWEAK_DEFAULTS={palette:["#141210","#b9926b","#f8f5ef"],heading:"Cinzel",body:"Jost",heroVariant:"a",prestaLayout:"grille",aboutLayout:"triptyque"},PRESTATIONS=[{n:"01",title:"Mariages",id:"presta-mariage",href:"mariages.html",img:"Mariage \u2014 c\xE9r\xE9monie / golden hour",text:"De la promesse \xE9chang\xE9e aux derniers pas de danse \u2014 une narration sensible et discr\xE8te de votre journ\xE9e, au plus pr\xE8s de l'\xE9motion, sans mise en sc\xE8ne inutile."},{n:"02",title:"Portraits",id:"presta-portrait",href:"portraits.html",img:"Portrait \u2014 lumi\xE8re naturelle / ext\xE9rieur",text:"Un portrait qui vous ressemble, en lumi\xE8re naturelle ou en ext\xE9rieur. Personnel, artistique ou pour votre image de marque \u2014 sinc\xE8re et vivant."},{n:"03",title:"Studio",id:"presta-studio",href:"studio.html",img:"Studio \u2014 portrait \xE9ditorial",text:"Portraits \xE9ditoriaux et corporate. Lumi\xE8re ma\xEEtris\xE9e, direction soign\xE9e et tirages d'exception pour une pr\xE9sence qui marque."},{n:"04",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",id:"presta-maternite",href:"maternite-grossesse.html",img:"Maternit\xE9 \u2014 studio / lumi\xE8re douce",text:"La douceur de l'attente, saisie en studio ou en lumi\xE8re naturelle. Des images intemporelles, dans l'intimit\xE9 et le calme du moment."},{n:"05",title:"Couple",id:"presta-couple",href:"couple.html",img:"Couple \u2014 s\xE9ance ext\xE9rieure",text:"Une s\xE9ance complice, en ext\xE9rieur ou en atelier, pour c\xE9l\xE9brer ce qui vous lie. Des regards, des gestes, une histoire qui vous ressemble."},{n:"06",title:"Famille",id:"presta-famille",href:"famille.html",img:"Famille \u2014 s\xE9ance complice en ext\xE9rieur",text:"Des images vraies de votre tribu, complices et vivantes \u2014 en ext\xE9rieur ou \xE0 la maison, au rythme des enfants. Du fou rire au c\xE2lin, sans poses fig\xE9es."}];function Slot({id,ph,style,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,"aria-label":ph,role:"img",style,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav(){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTATIONS.map(p=>React.createElement("a",{key:p.id,href:p.href,onClick:()=>setOpen(!1)},p.title))),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"#contact",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:"#hero",className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"},React.createElement("a",{href:PRESTATIONS[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTATIONS.map(p=>React.createElement("a",{key:p.id,href:p.href},p.title)))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"},"\xC0 propos"),React.createElement("a",{href:"#contact",className:"nav-cta"},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}const HOME_HERO={over:"Photographe \xB7 Suisse romande",title:"Afterglow",by:"by Kevin Chinelli",tag:"L'\xE9motion d'un instant, et la lumi\xE8re qui s'attarde."};function HeroCtas({light}){return React.createElement("div",{className:"hh-ctas reveal in d3"},React.createElement("a",{className:"hh-btn"+(light?" on-img":""),href:"portfolio.html"},"Voir le portfolio ",React.createElement("span",{className:"ar"},"\u2192")),React.createElement("a",{className:"hh-link",href:"contact.html"},"R\xE9server une date"))}function HomeHero({variant="a"}){const H=HOME_HERO;return variant==="b"?React.createElement("section",{id:"hero",className:"hhero vb"},React.createElement("div",{className:"hh-text"},React.createElement("div",{className:"overline hh-over reveal in"},H.over),React.createElement("h1",{className:"hh-title reveal in d1"},H.title),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,null),React.createElement("div",{className:"hh-meta reveal in d3"},"Mariage \xB7 Couple \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-img"},React.createElement(Slot,{id:"home-hero-split",ph:"Image hero \u2014 portrait vertical",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}}))):variant==="c"?React.createElement("section",{id:"hero",className:"hhero vc"},React.createElement("div",{className:"hh-inner"},React.createElement("div",{className:"hh-kicker reveal in"},H.title," \u2014 ",H.by),React.createElement("h1",{className:"hh-statement reveal in d1"},"L'\xE9motion d'un instant,",React.createElement("br",null),React.createElement("em",null,"et la lumi\xE8re qui s'attarde.")),React.createElement(HeroCtas,null)),React.createElement("div",{className:"hh-strip reveal in d2"},React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-1",ph:"S\xE9lection \u2014 1",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-2",ph:"S\xE9lection \u2014 2",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"home-hero-strip-3",ph:"S\xE9lection \u2014 3",style:{width:"100%",height:"100%"}})))):React.createElement("section",{id:"hero",className:"hhero va"},React.createElement("div",{className:"hh-bg"},React.createElement(Slot,{id:"home-hero-full",ph:"Image hero \u2014 pleine page",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}}),React.createElement(Slot,{id:"home-hero-mobile",ph:"Image hero \u2014 portrait mobile",loading:"eager",fetchpriority:"high",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"hh-inner"},React.createElement("div",{className:"overline hh-over reveal in"},H.over),React.createElement("h1",{className:"hh-title reveal in d1"},H.title),React.createElement("div",{className:"hh-by reveal in d1"},H.by),React.createElement("p",{className:"hh-tag reveal in d2"},H.tag),React.createElement(HeroCtas,{light:!0}),React.createElement("div",{className:"hh-meta on-img reveal in d3"},"Mariage \xB7 Couple \xB7 Famille \xB7 Studio \xB7 Maternit\xE9")),React.createElement("div",{className:"hh-scroll reveal in d3"},"\u2193"))}const ABOUT_INTRO=["Depuis une dizaine d'ann\xE9es que je travaille \xE0 travers l'image, j'ai appris une chose : les moments qui comptent ne se mettent pas en sc\xE8ne. Mon travail, c'est d'\xEAtre l\xE0 \u2014 attentif, discret, \xE0 l'\xE9coute \u2014 au moment exact o\xF9 quelque chose de vrai se passe.","Bas\xE9 en Suisse romande, je me d\xE9place partout o\xF9 une histoire m\xE9rite d'\xEAtre racont\xE9e \u2014 avec discr\xE9tion, patience, et le souci constant du d\xE9tail."],ABOUT_QUOTE="\xAB Une photographie r\xE9ussie, c'est un souvenir qui respire encore, des ann\xE9es plus tard. \xBB";function AboutEditorial(){return React.createElement("div",{className:"wrap-narrow about-edi"},React.createElement(Overline,{className:"reveal ab-center"},"\xC0 propos"),React.createElement("blockquote",{className:"kicker-quote about-edi-lead reveal d1"},ABOUT_QUOTE),React.createElement("div",{className:"about-edi-body reveal d2"},ABOUT_INTRO.map((p,i)=>React.createElement("p",{key:i},p))),React.createElement("div",{className:"signature reveal d3"},"Kevin Chinelli"),React.createElement("div",{className:"about-edi-img reveal d3"},React.createElement(Slot,{id:"about-wide",ph:"Kevin au travail \u2014 format paysage",style:{width:"100%",height:"100%"}})))}function AboutDecale(){return React.createElement("div",{className:"wrap about-dec"},React.createElement("div",{className:"about-dec-fig reveal"},React.createElement("div",{className:"ab-frame"}),React.createElement(Slot,{id:"about-portrait",ph:"Portrait \u2014 Kevin Chinelli, vertical",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"about-dec-txt"},React.createElement(Overline,{className:"reveal"},"\xC0 propos"),React.createElement("h2",{className:"display about-name reveal d1"},"Kevin Chinelli"),ABOUT_INTRO.map((p,i)=>React.createElement("p",{key:i,className:"reveal d"+(i+2)},p)),React.createElement("hr",{className:"hair reveal d3",style:{width:"90px",margin:"6px 0"}}),React.createElement("blockquote",{className:"kicker-quote reveal d3",style:{margin:0,fontSize:"clamp(20px,2.2vw,30px)"}},ABOUT_QUOTE),React.createElement("div",{className:"signature reveal d4"},"Kevin")))}function AboutTriptyque(){return React.createElement("div",{className:"wrap about-tri"},React.createElement("div",{className:"about-tri-head"},React.createElement(Overline,{className:"reveal ab-center"},"\xC0 propos"),React.createElement("h2",{className:"display about-name reveal d1",style:{marginTop:"20px"}},"Kevin Chinelli"),React.createElement("div",{className:"about-tri-body reveal d2"},ABOUT_INTRO.map((p,i)=>React.createElement("p",{key:i},p)))),React.createElement("div",{className:"about-solo reveal d2"},React.createElement(Slot,{id:"about-photo",ph:"Kevin Chinelli \u2014 paysage",style:{width:"100%",height:"100%"}}),React.createElement(Slot,{id:"about-photo-mobile",ph:"Kevin Chinelli \u2014 portrait",style:{width:"100%",height:"100%"}})),React.createElement("blockquote",{className:"kicker-quote about-tri-quote reveal d2"},ABOUT_QUOTE),React.createElement("div",{className:"signature reveal d3",style:{textAlign:"center"}},"Kevin Chinelli"))}function About({layout}){return React.createElement("section",{id:"about",className:"sec s-light pad-y"},React.createElement(layout==="decale"?AboutDecale:layout==="triptyque"?AboutTriptyque:AboutEditorial,null))}function PrestationsBandes(){return React.createElement("div",null,PRESTATIONS.map((p,i)=>React.createElement("div",{key:p.id,className:"band reveal "+(i%2===1?"flip":"")},React.createElement("div",{className:"band-img"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"band-txt"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("p",null,p.text),React.createElement("a",{href:p.href,className:"link-arrow",style:{marginTop:"6px"}},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192"))))))}function PrestationsGrille(){return React.createElement("div",{className:"wrap",style:{paddingBottom:"clamp(90px,12vw,170px)"}},React.createElement("div",{className:"svc-grid"},PRESTATIONS.map(p=>React.createElement("a",{key:p.id,href:p.href,className:"svc-card reveal"},React.createElement(Slot,{id:p.id,ph:p.img,style:{width:"100%",height:"100%"}}),React.createElement("div",{className:"veil"}),React.createElement("div",{className:"svc-body"},React.createElement("div",{className:"num"},p.n),React.createElement("h3",null,p.title),React.createElement("span",{className:"link-arrow"},"D\xE9couvrir ",React.createElement("span",{className:"ar"},"\u2192")))))))}function Prestations({layout}){return React.createElement("section",{id:"prestations",className:"sec s-dark"},React.createElement("div",{className:"wrap",style:{paddingTop:"clamp(90px,12vw,150px)",paddingBottom:"clamp(50px,6vw,80px)",textAlign:"center"}},React.createElement(Overline,{className:"reveal"},"Prestations"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(30px,4vw,56px)",marginTop:"22px"}},"\xC0 chaque histoire, son \xE9criture.")),React.createElement(layout==="grille"?PrestationsGrille:PrestationsBandes,null))}function Gallery(){return React.createElement("section",{id:"portfolio",className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:"clamp(34px,4vw,60px)",flexWrap:"wrap",gap:"20px"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Travaux choisis"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px"}},"Une s\xE9lection.")),React.createElement("a",{href:"portfolio.html",className:"link-arrow reveal d1"},"Voir le portfolio ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"gal reveal d1","data-lb-group":"portfolio"},React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"gal-main",ph:"Image large",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"stack"},React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"gal-2",ph:"Image",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"cell"},React.createElement(Slot,{id:"gal-3",ph:"Image",style:{width:"100%",height:"100%"}}))))))}const PROCESS=[{n:"01",title:"On se parle",text:"Un \xE9change sans engagement pour comprendre votre projet, vos envies, et trouver ensemble la date id\xE9ale."},{n:"02",title:"La s\xE9ance",text:"Je vous guide avec discr\xE9tion. Pas de poses fig\xE9es \u2014 juste la lumi\xE8re, le moment, ce qui se passe naturellement."},{n:"03",title:"La s\xE9lection",text:"Je prends le temps de s\xE9lectionner et retoucher chaque image avec soin. Votre galerie est pr\xEAte sous trois semaines."},{n:"04",title:"La livraison",text:"Vos photos en haute r\xE9solution, dans une galerie priv\xE9e en ligne. Des souvenirs pour toujours."}];function Process(){return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},"Comment \xE7a se passe"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,48px)",marginTop:"18px",marginBottom:"clamp(50px,7vw,90px)"}},"De la prise de contact",React.createElement("br",null),"\xE0 vos souvenirs."),React.createElement("div",{className:"process-grid"},PROCESS.map((s,i)=>React.createElement("div",{key:s.n,className:"process-step reveal d"+(i+1)},React.createElement("div",{className:"process-num"},s.n),React.createElement("h3",{className:"process-title"},s.title),React.createElement("p",{className:"process-text"},s.text))))))}function Contact(){const[sent,setSent]=useState(!1),[err,setErr]=useState({}),[sending,setSending]=useState(!1),[sendError,setSendError]=useState("");return React.createElement("section",{id:"contact",className:"sec s-darker contact"},React.createElement("div",{className:"wrap pad-y"},React.createElement("div",{className:"grid",style:{textAlign:"center"}},React.createElement("div",null,React.createElement(Overline,{className:"reveal"},"Parlons de votre projet"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,70px)",marginTop:"22px"}},"R\xE9servez votre date.")),sent?React.createElement("div",{className:"form-sent reveal d2"},React.createElement("div",{className:"fs-mark"},"\u2713"),React.createElement("h3",null,"Merci, votre demande est bien partie."),React.createElement("p",null,"Je l'ai bien re\xE7ue et je vous r\xE9ponds personnellement sous 48\xA0h ouvr\xE9es. \xC0 tr\xE8s vite\xA0!"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch",className:"link-arrow"},"contact@afterglowbykevin.ch ",React.createElement("span",{className:"ar"},"\u2192"))):React.createElement("form",{className:"form reveal d2",noValidate:!0,onSubmit:async e=>{e.preventDefault();const f=e.target,data={nom:f.nom.value.trim(),email:f.email.value.trim(),type:f.type.value,message:f.message.value.trim()},errs={};if(data.nom||(errs.nom="Indiquez votre nom."),/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||(errs.email="Adresse email invalide."),data.message||(errs.message="\xC9crivez quelques mots sur votre projet."),setErr(errs),!Object.keys(errs).length){setSending(!0),setSendError("");try{const res=await fetch("contact.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}),j=await res.json().catch(()=>({}));res.ok&&j&&j.ok?setSent(!0):res.status===429?setSendError("Trop d'envois en peu de temps. Patientez quelques minutes, puis r\xE9essayez."):setSendError("Une erreur est survenue \xE0 l'envoi. R\xE9essayez, ou \xE9crivez-moi directement \xE0 contact@afterglowbykevin.ch.")}catch{setSendError("Connexion impossible. V\xE9rifiez votre r\xE9seau, ou \xE9crivez-moi \xE0 contact@afterglowbykevin.ch.")}finally{setSending(!1)}}}},React.createElement("div",{className:"field-row"},React.createElement("div",{className:"field"+(err.nom?" error":"")},React.createElement("label",null,"Nom"),React.createElement("input",{className:"control",name:"nom",type:"text",placeholder:"Votre nom"}),err.nom&&React.createElement("span",{className:"field-err"},err.nom)),React.createElement("div",{className:"field"+(err.email?" error":"")},React.createElement("label",null,"Email"),React.createElement("input",{className:"control",name:"email",type:"email",placeholder:"vous@email.com"}),err.email&&React.createElement("span",{className:"field-err"},err.email))),React.createElement("div",{className:"field"},React.createElement("label",null,"Type de shooting"),React.createElement("select",{className:"control",name:"type",defaultValue:""},React.createElement("option",{value:"",disabled:!0},"S\xE9lectionner"),PRESTATIONS.map(p=>React.createElement("option",{key:p.id,value:p.title},p.title)),React.createElement("option",{value:"autre"},"Autre"))),React.createElement("div",{className:"field"+(err.message?" error":"")},React.createElement("label",null,"Message"),React.createElement("textarea",{className:"control",name:"message",rows:"4",placeholder:"Parlez-moi de votre projet, de la date envisag\xE9e\u2026"}),err.message&&React.createElement("span",{className:"field-err"},err.message)),sendError&&React.createElement("span",{className:"field-err",style:{display:"block",marginBottom:"12px"}},sendError),React.createElement("button",{className:"btn-submit",type:"submit",disabled:sending},sending?"Envoi\u2026":"Envoyer"," ",React.createElement("span",{className:"ar"},"\u2192"))),React.createElement("div",{className:"contact-direct reveal d3"},React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch")))))}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("div",{className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"Instagram"),React.createElement("a",{href:"tel:+41764247603"},"+41 76 424 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"))))}function Tweaks({t,setTweak}){return React.createElement(TweaksPanel,{title:"Tweaks"},React.createElement(TweakSection,{label:"Mise en page"}),React.createElement(TweakRadio,{label:"Hero",value:t.heroVariant,options:[{value:"a",label:"Plein cadre"},{value:"b",label:"Diptyque"},{value:"c",label:"\xC9ditorial"}],onChange:v=>setTweak("heroVariant",v)}),React.createElement(TweakRadio,{label:"Prestations",value:t.prestaLayout,options:[{value:"bandes",label:"Bandes"},{value:"grille",label:"Grille"}],onChange:v=>setTweak("prestaLayout",v)}),React.createElement(TweakRadio,{label:"\xC0 propos",value:t.aboutLayout,options:[{value:"editorial",label:"\xC9ditorial"},{value:"decale",label:"D\xE9cal\xE9"},{value:"triptyque",label:"Triptyque"}],onChange:v=>setTweak("aboutLayout",v)}),React.createElement(TweakSection,{label:"Couleur"}),React.createElement(TweakColor,{label:"Palette",value:t.palette,options:PALETTE_OPTS,onChange:v=>setTweak("palette",v)}),React.createElement(TweakSection,{label:"Typographie"}),React.createElement(TweakRadio,{label:"Titres",value:t.heading,options:["Cinzel","Cormorant"],onChange:v=>setTweak("heading",v)}),React.createElement(TweakRadio,{label:"Texte",value:t.body,options:["Jost","Mulish"],onChange:v=>setTweak("body",v)}))}function App(){const[t,setTweak]=useTweaks(TWEAK_DEFAULTS);return useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",HEAD_FONTS[t.heading]||HEAD_FONTS.Cinzel),r.setProperty("--font-body",BODY_FONTS[t.body]||BODY_FONTS.Jost)},[t.palette,t.heading,t.body]),useEffect(()=>{function ease(t2){return t2<.5?4*t2*t2*t2:(t2-1)*(2*t2-2)*(2*t2-2)+1}function smoothTo(target,dur){const start=window.scrollY,dist=target-start;let t0=null;document.documentElement.style.scrollBehavior="auto";function step(now){t0||(t0=now);const p=Math.min((now-t0)/dur,1);window.scrollTo(0,start+dist*ease(p)),p<1?requestAnimationFrame(step):document.documentElement.style.scrollBehavior=""}requestAnimationFrame(step)}function onClick(e){const a=e.target.closest('a[href^="#"]');if(!a)return;const id=a.getAttribute("href").slice(1),el=id?document.getElementById(id):null;if(id&&!el)return;e.preventDefault();const y=el?el.getBoundingClientRect().top+window.scrollY:0;smoothTo(y,900)}return document.addEventListener("click",onClick),()=>document.removeEventListener("click",onClick)},[]),useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.88&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,200);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},[t.prestaLayout,t.aboutLayout,t.heroVariant]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,null),React.createElement("main",null,React.createElement(HomeHero,{variant:t.heroVariant}),React.createElement(About,{layout:t.aboutLayout}),React.createElement(Prestations,{layout:t.prestaLayout}),React.createElement(Gallery,null),React.createElement(Process,null),React.createElement(Contact,null)),React.createElement(Footer,null),React.createElement(Tweaks,{t,setTweak}))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App,null));})();

;
/* ============================================================
   KEVIN CHINELLI — persistent conversion CTA + WhatsApp
   Vanilla, injected on every page (no React dependency).
   ⚠️ Replace KC_PHONE with the real number before going live.
   ============================================================ */
(function () {
  if (window.__kcCta) return; window.__kcCta = true;

  var KC_PHONE = "41764247603"; // format international sans "+" ni espaces
  var WA_TEXT  = encodeURIComponent("Bonjour Kevin, j'aimerais des informations pour une séance photo.");
  var here = (location.pathname.split("/").pop() || "").toLowerCase();
  if (here === "contact.html") return; // inutile sur la page contact

  var css = ''
    + '.kc-cta{position:fixed;right:clamp(16px,2.4vw,28px);bottom:clamp(16px,2.4vw,28px);z-index:880;'
    + '  display:flex;flex-direction:column;align-items:flex-end;gap:12px;'
    + '  font-family:var(--font-body,system-ui,sans-serif);'
    + '  opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}'
    + '.kc-cta.in{opacity:1;transform:none}'
    + '.kc-cta a{text-decoration:none}'
    + '.kc-wa{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;'
    + '  background:#1f1d1a;border:1px solid rgba(242,237,230,.16);color:#f2ede6;'
    + '  box-shadow:0 10px 30px rgba(0,0,0,.34);transition:transform .35s cubic-bezier(.2,.7,.2,1),background .35s,border-color .35s}'
    + '.kc-wa:hover{transform:translateY(-3px);background:#262320;border-color:var(--accent,#b9926b)}'
    + '.kc-wa svg{width:25px;height:25px;display:block}'
    + '.kc-devis{display:inline-flex;align-items:center;gap:11px;'
    + '  padding:14px 22px;border-radius:999px;background:var(--accent,#b9926b);color:#141210;'
    + '  font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:500;'
    + '  box-shadow:0 12px 34px rgba(0,0,0,.32);transition:transform .35s cubic-bezier(.2,.7,.2,1),filter .35s}'
    + '.kc-devis:hover{transform:translateY(-3px);filter:brightness(1.06)}'
    + '.kc-devis .ar{transition:transform .4s cubic-bezier(.2,.7,.2,1)}'
    + '.kc-devis:hover .ar{transform:translateX(5px)}'
    + '@media(max-width:600px){.kc-devis{padding:12px 18px;font-size:11px}.kc-wa{width:48px;height:48px}}'
    + '@media print{.kc-cta{display:none}}'
    + '@media (prefers-reduced-motion:reduce){.kc-cta{transition:none;opacity:1;transform:none}}';

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var waSvg = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 29l8.2-1.6c1.7.9 3.7 1.4 5.8 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-4.9 1 1-4.7-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C4.4 9.9 9.1 5.2 16 5.2S27.6 9.9 27.6 15 22.9 24.8 16 24.8zm6.5-7.3c-.4-.2-2.1-1-2.4-1.1-.3-.1-.6-.2-.8.2-.2.4-.9 1.1-1.1 1.3-.2.2-.4.2-.8.1-.4-.2-1.5-.6-2.9-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.6.2-.2.2-.4.4-.6.1-.2.1-.5 0-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.5-.3.4-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.6.2-1.7-.1-.2-.3-.3-.7-.4z"/></svg>';

  var wrap = document.createElement("div");
  wrap.className = "kc-cta";
  wrap.innerHTML =
      '<a class="kc-wa" href="https://wa.me/' + KC_PHONE + '?text=' + WA_TEXT + '" target="_blank" rel="noopener" aria-label="Écrire sur WhatsApp">' + waSvg + '</a>'
    + '<a class="kc-devis" href="contact.html">Demander un devis <span class="ar">→</span></a>';
  document.body.appendChild(wrap);
  requestAnimationFrame(function () { setTimeout(function () { wrap.classList.add("in"); }, 600); });

  /* Remonte les boutons quand le footer entre dans le viewport.
     getBoundingClientRect() est fiable sur mobile (barre URL dynamique incluse). */
  function baseBottom() {
    return Math.max(16, Math.min(28, window.innerWidth * 0.024));
  }
  var footerEl = document.querySelector("footer");
  if (footerEl) {
    function updateCtaBottom() {
      var rect = footerEl.getBoundingClientRect();
      var wh = window.innerHeight;
      if (rect.top < wh) {
        wrap.style.bottom = (wh - rect.top + baseBottom()) + "px";
      } else {
        wrap.style.bottom = "";
      }
    }
    window.addEventListener("scroll", updateCtaBottom, { passive: true });
    window.addEventListener("resize", updateCtaBottom);
    updateCtaBottom();
  }
})();

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
