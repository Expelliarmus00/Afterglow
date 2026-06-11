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
   KEVIN CHINELLI — Landing pages locales (SEO local par ville)
   window.KC_VILLE[slug]. Contenu unique et substantiel par ville
   (pas de pages "doorway"). Lu par kc-ville-app.jsx.
   ============================================================ */
window.KC_VILLE = {

  /* ===================== LAUSANNE ===================== */
  lausanne: {
    slug: "lausanne", ville: "Lausanne", region: "Vaud",
    h1: "Photographe de mariage à Lausanne",
    heroImg: "Couple de mariés sur les quais d'Ouchy à Lausanne, lac Léman",
    heroHint: "Reportage de mariage à Lausanne et sur les rives du Léman — discret, à hauteur d'émotion.",
    intro: {
      lead: "Se marier à Lausanne, c'est conjuguer la ville et le lac : une cathédrale gothique perchée sur la colline, les quais d'Ouchy ouverts sur le Léman, et la lumière changeante de la baie. Je connais cette ville et ses recoins, et je sais où la lumière sera la plus belle à chaque heure de votre journée.",
      paragraphs: [
        "Photographe basé en Suisse romande, je couvre les mariages à Lausanne sans frais de déplacement : de la préparation en centre-ville à la cérémonie civile à l'Hôtel de Ville de la place de la Palud, jusqu'à la réception sur les hauteurs ou au bord de l'eau. Mon approche reste la même partout — du reportage, peu de poses, beaucoup d'attention aux instants qui passent vite.",
        "Lausanne offre des décors variés à quelques minutes les uns des autres : on peut enchaîner une séance de couple devant la cathédrale, sur les escaliers du Marché, puis terminer à l'heure dorée sur les quais d'Ouchy ou dans les vignes de Lavaux toutes proches.",
      ],
      quote: "« La ville et le lac, dans une même journée. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Lausanne",
      list: [
        "La cathédrale de Lausanne et l'esplanade de la Cité — vue plongeante sur les toits et le lac.",
        "Les quais d'Ouchy et le Beau-Rivage Palace — l'élégance au bord du Léman.",
        "L'Hôtel de Ville, place de la Palud — pour la cérémonie civile au cœur de la vieille ville.",
        "Les escaliers du Marché et la place de la Riponne — ambiance urbaine et intime.",
        "Le bois de Sauvabelin et son lac — un écrin de verdure à dix minutes du centre.",
        "Les vignes de Lavaux, à l'est de la ville — imbattables au coucher du soleil.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous gratuitement à Lausanne ?", a: "Oui, Lausanne est dans ma zone de couverture principale : aucun frais de déplacement. Je me déplace aussi librement dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et en Valais romand." },
      { q: "Connaissez-vous les lieux de mariage lausannois ?", a: "Très bien — de la cathédrale aux quais d'Ouchy, en passant par l'Hôtel de Ville, Sauvabelin et les domaines de Lavaux. Au repérage, on cale ensemble le déroulé et les meilleurs spots selon l'heure et la lumière de votre date." },
      { q: "Peut-on faire les photos de couple sur les quais ?", a: "Absolument. Les quais d'Ouchy et le bord du Léman sont parfaits à l'heure dorée. Pour éviter la foule estivale, on privilégie le début de matinée ou la fin de journée." },
    ],
    related: { article: "journal-spots-photo-couple-leman.html", articleTitle: "Spots photo de couple autour du Léman" },
  },

  /* ===================== GENÈVE ===================== */
  geneve: {
    slug: "geneve", ville: "Genève", region: "Genève",
    h1: "Photographe de mariage à Genève",
    heroImg: "Couple de mariés dans la vieille ville de Genève, ruelles pavées",
    heroHint: "Reportage de mariage à Genève, de la vieille ville aux rives du lac.",
    intro: {
      lead: "Genève marie l'élégance internationale et le charme d'une vieille ville médiévale. Entre la cathédrale Saint-Pierre, les ruelles de la Cité, les parcs au bord du lac et le jet d'eau, la ville offre des décors d'une grande variété pour un reportage de mariage.",
      paragraphs: [
        "Je photographie les mariages à Genève sans frais de déplacement depuis la Suisse romande. De la cérémonie civile à la Salle des mariages, à la réception dans un domaine de la campagne genevoise ou sur les bords du lac, je suis votre journée en reportage, discrètement, du premier regard au dernier éclat de rire.",
        "Genève est idéale pour varier les ambiances en peu de temps : on passe des marronniers de la promenade de la Treille aux quais et au jet d'eau, puis aux ruelles de la vieille ville pour des images plus intimes.",
      ],
      quote: "« Le raffinement d'une ville ouverte sur le monde. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Genève",
      list: [
        "La vieille ville et la cathédrale Saint-Pierre — ruelles pavées et perspectives historiques.",
        "Le Parc des Bastions et la promenade de la Treille — marronniers et bancs romantiques.",
        "Les Bains des Pâquis — lumière du matin et vue sur le jet d'eau.",
        "Le Parc La Grange et ses roseraies — l'un des plus beaux jardins de la ville.",
        "Les quais et le jet d'eau — l'image emblématique de Genève.",
        "Les domaines viticoles de la campagne genevoise — pour une réception au vert.",
      ],
    },
    faq: [
      { q: "Intervenez-vous à Genève sans supplément ?", a: "Oui. Le déplacement pour un mariage à Genève est inclus dans la formule — il est chiffré au forfait dans le devis, sans mauvaise surprise. Je couvre l'ensemble de la Suisse romande : Vaud, Genève, Fribourg, Neuchâtel et le Valais romand." },
      { q: "Où faire les photos de couple à Genève ?", a: "La vieille ville et la cathédrale Saint-Pierre pour le cachet historique, le Parc des Bastions pour la verdure, et les quais ou les Bains des Pâquis pour le lac et le jet d'eau. On choisit selon votre déroulé et la lumière du jour." },
      { q: "Gérez-vous les cérémonies civiles à Genève ?", a: "Oui, j'ai l'habitude des salles des mariages et des contraintes de lumière en intérieur. On anticipe ensemble le timing pour ne rien manquer de l'échange des consentements." },
    ],
    related: { article: "journal-spots-photo-couple-leman.html", articleTitle: "Spots photo de couple autour du Léman" },
  },

  /* ===================== MONTREUX ===================== */
  montreux: {
    slug: "montreux", ville: "Montreux", region: "Riviera vaudoise",
    h1: "Photographe de mariage à Montreux",
    heroImg: "Couple de mariés sur les quais fleuris de Montreux, château de Chillon",
    heroHint: "Reportage de mariage à Montreux et sur la Riviera, face aux Alpes et au Léman.",
    intro: {
      lead: "Montreux et la Riviera vaudoise offrent l'un des décors les plus spectaculaires de Suisse : les quais fleuris, le château de Chillon posé sur l'eau, les vignes de Lavaux à l'ouest et les Alpes en toile de fond. Un cadre de carte postale pour un mariage face au lac.",
      paragraphs: [
        "Je couvre les mariages à Montreux, Vevey, Clarens et sur toute la Riviera sans frais de déplacement. Reportage discret, séance de couple à l'heure dorée sur les quais ou au château de Chillon, et toute la souplesse pour s'adapter à la météo changeante du haut-lac.",
        "La Riviera permet des contrastes saisissants en peu de distance : la douceur méditerranéenne des quais et de leurs massifs fleuris, la pierre monumentale de Chillon, puis la hauteur et la fraîcheur des Rochers-de-Naye pour les plus aventureux.",
      ],
      quote: "« Le lac, les fleurs et les Alpes, réunis. »",
    },
    lieux: {
      title: "Les plus beaux lieux de mariage à Montreux et sur la Riviera",
      list: [
        "Le château de Chillon — décor monumental, posé sur le Léman.",
        "Les quais fleuris de Montreux — massifs colorés et Alpes en arrière-plan.",
        "Le Montreux Palace et les grands hôtels de la Belle Époque — élégance d'époque.",
        "Glion et les hauteurs de Caux — vue panoramique sur le haut-lac.",
        "Vevey, sa place du Marché et la Confrérie — charme d'une ville au bord de l'eau.",
        "Les vignes de Lavaux, en limite ouest — pour l'heure dorée dans les terrasses.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous à Montreux et sur la Riviera ?", a: "Oui. Le déplacement pour un mariage à Montreux, Vevey ou sur la Riviera est inclus dans la formule — chiffré au forfait dans le devis, sans surprise. Je couvre l'ensemble de la Suisse romande." },
      { q: "Peut-on faire des photos au château de Chillon ?", a: "Oui, les abords du château offrent un décor spectaculaire. L'accès aux intérieurs et certaines zones peut nécessiter une autorisation : on anticipe ce point ensemble lors de la préparation." },
      { q: "Quelle est la meilleure heure pour les quais de Montreux ?", a: "L'heure dorée, en fin de journée : la lumière chaude sublime les massifs fleuris et le lac, avec les Alpes qui rosissent en arrière-plan. Le matin tôt est aussi superbe et plus calme." },
    ],
    related: { article: "journal-lieux-mariage-lavaux.html", articleTitle: "Où se marier en Lavaux : 8 lieux face au Léman" },
  },

  /* ===================== FAMILLE × LAUSANNE ===================== */
  "famille-lausanne": {
    slug: "famille-lausanne", ville: "Lausanne", region: "Vaud",
    presta: { slug: "famille", href: "famille.html", label: "famille", crumb: "Famille", card: "La prestation famille" },
    h1: "Photographe de famille à Lausanne",
    heroImg: "Famille complice sur les quais d'Ouchy à Lausanne, lumière dorée",
    heroHint: "Photographe de famille à Lausanne — des images vraies, au rythme des enfants.",
    intro: {
      lead: "Une séance photo de famille à Lausanne, c'est profiter d'une ville à taille humaine, ouverte sur le lac : des quais où les enfants courent, des parcs, et la lumière du Léman en toile de fond. Je capte votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Basé en Suisse romande, je me déplace à Lausanne sans frais : quais d'Ouchy, parcs de la ville, bois de Sauvabelin, ou directement chez vous pour des images intimes du quotidien. Pas de poses figées — on joue, on bouge, et je saisis les vrais moments.",
        "Lausanne permet de varier les ambiances en une seule séance : la verdure d'un parc, les galets du bord du lac, puis une glace partagée à l'heure dorée. La séance s'adapte à l'âge des enfants et à leur énergie du jour.",
      ],
      quote: "« Les enfants grandissent vite — gardons-en la trace, ici, maintenant. »",
    },
    lieux: {
      title: "Mes lieux préférés pour une séance famille à Lausanne",
      list: [
        "Les quais d'Ouchy et le parc du Denantou — espace, lac et lumière douce.",
        "Le bois de Sauvabelin et son lac — nature et liberté à dix minutes du centre.",
        "Le parc de Mon-Repos — allées arborées et cadre paisible.",
        "Les hauteurs et vignes de Lavaux, tout proches — pour l'heure dorée.",
        "À domicile, dans votre quotidien — le matin du week-end, en pyjama, est souvent parfait.",
      ],
    },
    faq: [
      { q: "Vous déplacez-vous gratuitement à Lausanne pour une séance famille ?", a: "Oui, Lausanne est dans ma zone de couverture principale : aucun frais de déplacement. Je me déplace aussi dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et en Valais romand." },
      { q: "Où faire les photos de famille à Lausanne ?", a: "En extérieur — quais d'Ouchy, Sauvabelin, parc de Mon-Repos, vignes de Lavaux — ou à votre domicile pour des images du quotidien. On choisit selon l'âge des enfants et l'ambiance que vous aimez." },
      { q: "Quel est le meilleur moment pour une séance avec des enfants ?", a: "En fin d'après-midi pour la belle lumière, mais surtout au moment où les enfants sont le plus disponibles (après la sieste, après le goûter). On s'adapte à leur rythme — c'est la clé de photos réussies." },
    ],
  },

  /* ===================== FAMILLE × GENÈVE ===================== */
  "famille-geneve": {
    slug: "famille-geneve", ville: "Genève", region: "Genève",
    presta: { slug: "famille", href: "famille.html", label: "famille", crumb: "Famille", card: "La prestation famille" },
    h1: "Photographe de famille à Genève",
    heroImg: "Famille complice dans un parc de Genève, lumière naturelle",
    heroHint: "Photographe de famille à Genève — des images vraies, sans poses figées.",
    intro: {
      lead: "Une séance photo de famille à Genève profite de parcs magnifiques et des rives du lac : de la verdure, de l'espace pour courir, et le jet d'eau en arrière-plan. Mon approche reste la même — capter les fous rires et la complicité, pas la pose parfaite.",
      paragraphs: [
        "Je photographie les familles à Genève sans frais de déplacement depuis la Suisse romande. Parc des Bastions, Parc La Grange, bords du lac, ou votre intérieur : on choisit le cadre qui vous ressemble et qui laisse les enfants être eux-mêmes.",
        "Genève offre de superbes décors verdoyants à deux pas du centre, parfaits pour une séance vivante où l'on marche, on joue et on se câline. La durée et le déroulé s'ajustent à l'âge des plus petits.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    lieux: {
      title: "Mes lieux préférés pour une séance famille à Genève",
      list: [
        "Le Parc La Grange et ses roseraies — l'un des plus beaux jardins de la ville.",
        "Le Parc des Bastions — marronniers, allées et grand échiquier qui amuse les enfants.",
        "Les bords du lac et les Bains des Pâquis — lumière du matin et vue sur le jet d'eau.",
        "La vieille ville et la promenade de la Treille — pour une touche plus urbaine.",
        "À domicile — pour des images tendres du quotidien familial.",
      ],
    },
    faq: [
      { q: "Intervenez-vous à Genève sans supplément pour une séance famille ?", a: "Oui, Genève fait partie de ma zone de couverture en Suisse romande : pas de frais de déplacement. Je rayonne aussi sur Vaud, Fribourg, Neuchâtel et le Valais romand." },
      { q: "Quels lieux pour une séance famille à Genève ?", a: "Le Parc La Grange et le Parc des Bastions pour la verdure, les bords du lac pour la lumière et le jet d'eau, ou votre domicile. On choisit selon l'âge des enfants et l'ambiance souhaitée." },
      { q: "Comment ça se passe avec de jeunes enfants ?", a: "Tout en souplesse : on joue, on bouge, on fait des pauses si besoin. Je ne cherche jamais à les figer — les enfants spontanés donnent les plus belles images." },
    ],
  },
};

;
(()=>{const V=window.KC_VILLE[window.KC_VILLE_SLUG],VP=V.presta||{slug:"mariage",href:"mariages.html",label:"mariage",crumb:"Mariages",card:"La prestation mariage"},VLOCAL=VP.label.charAt(0).toUpperCase()+VP.label.slice(1)+" \xE0 "+V.ville;function VilleReassure(){const points=["D\xE9placement inclus \xE0 "+V.ville,"R\xE9ponse sous 48 h"];return VP.slug==="mariage"&&points.push("1 seul mariage par jour"),points.push("Tarifs transparents"),React.createElement("section",{className:"reassure s-dark","aria-label":"Engagements"},React.createElement("div",{className:"wrap reassure-row"},points.map((p,i)=>React.createElement("div",{key:i,className:"reassure-item"},React.createElement("span",{className:"rdot"}),p))))}function VilleApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});return useApplyTweaks(t),useReveal([]),React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:VP.slug}),React.createElement("main",null,React.createElement("section",{className:"phero bas"},React.createElement("div",{className:"bg"},React.createElement(Slot,{id:"ville-hero-"+V.slug,ph:V.heroImg,alt:V.h1+" \u2014 Kevin Chinelli, photographe en Suisse romande",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"phero-content"},React.createElement("div",{className:"crumb reveal in"},React.createElement("a",{href:KC.HOME},"Accueil"),React.createElement("span",null,"/"),React.createElement("a",{href:VP.href},VP.crumb),React.createElement("span",null,"/"),React.createElement("span",null,V.ville)),React.createElement("h1",{className:"reveal in d1"},V.h1),React.createElement("p",{className:"hint reveal in d2"},V.heroHint))),React.createElement(VilleReassure,null),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal"},VLOCAL),React.createElement("div",{className:"intro-grid",style:{marginTop:"clamp(34px,4vw,58px)"}},React.createElement("p",{className:"lead reveal d1"},V.intro.lead),React.createElement("div",{className:"body reveal d2"},V.intro.paragraphs.map((p,i)=>React.createElement("p",{key:i},p)),React.createElement("div",{className:"intro-quote"},V.intro.quote))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(30px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Rep\xE9rage"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},V.lieux.title)),React.createElement("ul",{className:"art-list reveal d1"},V.lieux.list.map((li,i)=>React.createElement("li",{key:i},li))))),React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap related-grid",style:{gridTemplateColumns:"1fr 1fr"}},React.createElement("a",{href:VP.href,className:"related-card reveal"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-presta-"+V.slug,ph:VP.card,alt:VP.card+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,VP.card),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))),React.createElement("a",{href:"tarifs.html",className:"related-card reveal d1"},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"ville-cta-tarif-"+V.slug,ph:"Tarifs photographe Suisse romande",alt:"Tarifs photographe en Suisse romande",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,"Voir les tarifs"),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192"))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap-narrow"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(34px,4vw,56px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"Questions fr\xE9quentes"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(28px,3.4vw,46px)",marginTop:"20px"}},VLOCAL,".")),React.createElement("div",{className:"faq reveal d1"},V.faq.map((f,i)=>React.createElement("details",{key:i,open:i===0},React.createElement("summary",null,f.q,React.createElement("span",{className:"pm"})),React.createElement("div",{className:"ans"},f.a)))),V.related&&React.createElement("div",{style:{textAlign:"center",marginTop:"clamp(30px,4vw,48px)"}},React.createElement("a",{href:V.related.article,className:"link-arrow reveal"},"\xC0 lire : ",V.related.articleTitle," ",React.createElement("span",{className:"ar"},"\u2192"))))),React.createElement(CtaContact,{overline:VLOCAL,title:VP.slug==="mariage"?"V\xE9rifions votre date.":"R\xE9servez votre s\xE9ance."})),React.createElement(Footer,null),React.createElement(TweaksBase,{t,setTweak}))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(VilleApp,null));})();

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
