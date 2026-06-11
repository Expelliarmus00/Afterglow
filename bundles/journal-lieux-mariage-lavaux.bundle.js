(() => {
  const STATE_FILE = '.image-slots.state.json';

  // Shared sidecar store (lecture seule — écriture via Omelette supprimée)
  const subs = new Set();
  let slots = {};
  let loadP = null;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j === 'object') slots = j; })
      .catch(() => {})
      .then(() => { subs.forEach((fn) => fn()); });
    return loadP;
  }

  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v } : v;
  }

  // ── Custom element ──────────────────────────────────────────────────────
  const stylesheet =
    ':host{display:inline-block;position:relative;vertical-align:top;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55);width:240px;height:160px}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(0,0,0,.04)}' +
    '.frame img{position:absolute;inset:0;width:100%;height:100%;-webkit-user-drag:none;user-select:none}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  user-select:none}' +
    '.empty svg{opacity:.45}' +
    '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}';

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
      root.innerHTML =
        '<style>' + stylesheet + '</style>' +
        '<div class="frame" part="frame">' +
        '  <img part="image" alt="" draggable="false" style="display:none">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div>' +
        '</div>' +
        '</div>';
      this._frame = root.querySelector('.frame');
      this._img = root.querySelector('.frame img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._subFn = () => this._render();
    }

    connectedCallback() {
      subs.add(this._subFn);
      load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
    }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    _render() {
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

      const fit = this.getAttribute('fit') || 'cover';
      this._img.style.objectFit = fit;
      this._img.style.objectPosition = this.getAttribute('position') || '50% 50%';

      this._cap.textContent = this.getAttribute('placeholder') || 'Drop an image';

      const stored = this.id ? getSlot(this.id) : null;
      const url = (stored && stored.u) || this.getAttribute('src') || '';

      if (url) {
        if (this._img.getAttribute('src') !== url) this._img.src = url;
        this._img.alt = this.getAttribute('alt') || this.getAttribute('placeholder') || '';
        const loadingVal = this.getAttribute('loading') || 'lazy';
        this._img.setAttribute('loading', loadingVal);
        const fp = this.getAttribute('fetchpriority');
        if (fp) this._img.setAttribute('fetchpriority', fp);
        this._img.setAttribute('decoding', fp === 'high' ? 'sync' : 'async');
        this._img.style.display = 'block';
        this._empty.style.display = 'none';
      } else {
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        this._empty.style.display = 'flex';
      }
    }
  }

  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();

;
(()=>{function useTweaks(defaults){return[defaults,()=>{}]}Object.assign(window,{useTweaks});})();

;
(()=>{const{useState,useEffect,useRef}=React;(function(){try{var p=document.createElement("div");p.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;transition:opacity .05s linear;pointer-events:none",document.documentElement.appendChild(p),requestAnimationFrame(function(){p.style.opacity="1"}),setTimeout(function(){var op=parseFloat(getComputedStyle(p).opacity);op>.9||document.documentElement.classList.add("no-anim"),p.remove()},220)}catch{}})();const KC={PALETTES:{"Noir chaud":["#141210","#b9926b","#f8f5ef"],"Noir profond":["#0f0e0d","#9a8f7e","#efe9df"],Anthracite:["#16181a","#8a97a0","#eef0f1"],"Ardoise cuivre":["#12100f","#a9744f","#f3ede4"]},HEAD_FONTS:{Cinzel:'"Cinzel", Georgia, serif',Cormorant:'"Cormorant Garamond", Georgia, serif'},BODY_FONTS:{Jost:'"Jost", system-ui, sans-serif',Mulish:'"Mulish", system-ui, sans-serif'},HOME:"index.html"},PALETTE_OPTS=Object.values(KC.PALETTES),PRESTA_NAV=[{slug:"mariage",title:"Mariages",short:"Mariages",href:"mariages.html"},{slug:"portrait",title:"Portraits",short:"Portraits",href:"portraits.html"},{slug:"studio",title:"Studio",short:"Studio",href:"studio.html"},{slug:"maternite",title:"Maternit\xE9 & Grossesse",short:"Maternit\xE9",href:"maternite-grossesse.html"},{slug:"couple",title:"Couple",short:"Couple",href:"couple.html"},{slug:"famille",title:"Famille",short:"Famille",href:"famille.html"}];function Slot({id,ph,alt,style,className,loading,fetchpriority}){return React.createElement("image-slot",{id,shape:"rect",fit:"cover",placeholder:ph,alt:alt||ph,"aria-label":alt||ph,role:"img",style,class:className,loading,fetchpriority})}function Overline({children,className=""}){return React.createElement("div",{className:"overline "+className},React.createElement("span",{className:"tick"}),children)}function Nav({active=""}){const[scrolled,setScrolled]=useState(!1),[open,setOpen]=useState(!1);useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>40);return onScroll(),window.addEventListener("scroll",onScroll,{passive:!0}),()=>window.removeEventListener("scroll",onScroll)},[]),useEffect(()=>(document.body.style.overflow=open?"hidden":"",()=>{document.body.style.overflow=""}),[open]);const menu=ReactDOM.createPortal(React.createElement("div",{className:"mobile-menu"+(open?" is-open":""),onClick:()=>setOpen(!1)},React.createElement("div",{className:"mm-inner",onClick:e=>e.stopPropagation()},React.createElement("div",{className:"mm-group"},React.createElement("span",{className:"mm-label"},"Prestations"),PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,onClick:()=>setOpen(!1)},p.title))),React.createElement("a",{className:"mm-top",href:"portfolio.html",onClick:()=>setOpen(!1)},"Portfolio"),React.createElement("a",{className:"mm-top",href:"tarifs.html",onClick:()=>setOpen(!1)},"Tarifs"),React.createElement("a",{className:"mm-top",href:"journal.html",onClick:()=>setOpen(!1)},"Journal"),React.createElement("a",{className:"mm-top",href:"apropos.html",onClick:()=>setOpen(!1)},"\xC0 propos"),React.createElement("a",{className:"mm-top",href:"contact.html",onClick:()=>setOpen(!1)},"Contact"))),document.body);return React.createElement(React.Fragment,null,React.createElement("nav",{className:"nav"+(scrolled?" scrolled":"")+(open?" menu-open":"")},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"nav-links"},React.createElement("div",{className:"nav-item nav-extra"+(PRESTA_NAV.some(p=>p.slug===active)?" is-active":"")},React.createElement("a",{href:PRESTA_NAV[0].href,"aria-haspopup":"true"},"Prestations",React.createElement("span",{className:"caret"},"\u25BE")),React.createElement("div",{className:"nav-drop"},PRESTA_NAV.map(p=>React.createElement("a",{key:p.slug,href:p.href,className:active===p.slug?"is-active":""},p.title)))),React.createElement("a",{href:"portfolio.html",className:"nav-extra"+(active==="portfolio"?" is-active":"")},"Portfolio"),React.createElement("a",{href:"tarifs.html",className:"nav-extra"+(active==="tarifs"?" is-active":"")},"Tarifs"),React.createElement("a",{href:"journal.html",className:"nav-extra"+(active==="journal"?" is-active":"")},"Journal"),React.createElement("a",{href:"apropos.html",className:"nav-extra"+(active==="apropos"?" is-active":"")},"\xC0 propos"),React.createElement("a",{href:"contact.html",className:"nav-cta"+(active==="contact"?" is-active":"")},"Contact")),React.createElement("button",{className:"nav-burger","aria-label":"Ouvrir le menu","aria-expanded":open,onClick:()=>setOpen(o=>!o)},React.createElement("span",null),React.createElement("span",null))),menu)}function Footer(){return React.createElement("footer",{className:"s-dark",style:{borderTop:"1px solid var(--line-d)"}},React.createElement("div",{className:"footer"},React.createElement("a",{href:KC.HOME,className:"wordmark"},React.createElement("span",{className:"wm-main"},"Afterglow"),React.createElement("span",{className:"wm-by"},"by Kevin Chinelli")),React.createElement("div",{className:"copy"},"\xA9 2026 \u2014 Tous droits r\xE9serv\xE9s \xB7 Site cr\xE9\xE9 par ",React.createElement("a",{href:"https://snapshotmedia.ch",target:"_blank",rel:"noopener"},"Snapshot Media")),React.createElement("div",{className:"social"},React.createElement("a",{href:"apropos.html"},"\xC0 propos"),React.createElement("a",{href:"confidentialite.html"},"Confidentialit\xE9"),React.createElement("a",{href:"https://www.instagram.com/afterglowbykevin/",target:"_blank",rel:"noopener"},"Instagram"),React.createElement("a",{href:"tel:+41764247603"},"+41 76 424 76 03"),React.createElement("a",{href:"mailto:contact@afterglowbykevin.ch"},"contact@afterglowbykevin.ch"))))}function RelatedPresta({current}){const items=PRESTA_NAV.filter(p=>p.slug!==current).slice(0,3);return React.createElement("section",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap"},React.createElement("div",{style:{textAlign:"center",marginBottom:"clamp(32px,4vw,52px)"}},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 d\xE9couvrir aussi"),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(26px,3.2vw,44px)",marginTop:"18px"}},"Autres prestations.")),React.createElement("div",{className:"related-grid"},items.map((p,i)=>React.createElement("a",{key:p.slug,href:p.href,className:"related-card reveal d"+(i+1)},React.createElement("div",{className:"rc-img"},React.createElement(Slot,{id:"rel-"+current+"-"+p.slug,ph:p.title,alt:"Photographe "+p.title.toLowerCase()+" en Suisse romande \u2014 Kevin Chinelli",style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"rc-meta"},React.createElement("h3",null,p.title),React.createElement("span",{className:"ar"},"D\xE9couvrir \u2192")))))))}function CtaContact({overline="Parlons de votre projet",title="R\xE9servez votre date."}){return React.createElement("section",{className:"sec s-darker cta-band"},React.createElement("div",{className:"wrap pad-y",style:{textAlign:"center"}},React.createElement(Overline,{className:"reveal"},overline),React.createElement("h2",{className:"display reveal d1",style:{fontSize:"clamp(34px,5.4vw,72px)",margin:"22px 0 38px"}},title),React.createElement("a",{href:"contact.html",className:"link-arrow reveal d2",style:{fontSize:"14px"}},"Me contacter ",React.createElement("span",{className:"ar"},"\u2192"))))}function useReveal(deps=[]){useEffect(()=>{const reveal=()=>{const vh=window.innerHeight;document.querySelectorAll(".reveal:not(.in)").forEach(el=>{const r=el.getBoundingClientRect();r.top<vh*.9&&r.bottom>0&&el.classList.add("in")})};reveal(),window.addEventListener("scroll",reveal,{passive:!0}),window.addEventListener("resize",reveal);const id=setTimeout(reveal,220);return()=>{window.removeEventListener("scroll",reveal),window.removeEventListener("resize",reveal),clearTimeout(id)}},deps)}function useApplyTweaks(t){useEffect(()=>{const r=document.documentElement.style;Array.isArray(t.palette)&&(r.setProperty("--bg",t.palette[0]),r.setProperty("--accent",t.palette[1]),r.setProperty("--cream",t.palette[2])),r.setProperty("--font-display",KC.HEAD_FONTS[t.heading]||KC.HEAD_FONTS.Cinzel),r.setProperty("--font-body",KC.BODY_FONTS[t.body]||KC.BODY_FONTS.Jost)},[t.palette,t.heading,t.body])}Object.assign(window,{KC,PALETTE_OPTS,PRESTA_NAV,Slot,Overline,Nav,Footer,CtaContact,RelatedPresta,useReveal,useApplyTweaks});})();

;
/* ============================================================
   KEVIN CHINELLI — Journal (articles longue traîne / SEO local)
   window.KC_JOURNAL = { meta, articles: { slug: {...} } }
   ============================================================ */
window.KC_JOURNAL = {
  meta: {
    title: "Journal",
    intro: "Conseils, repérages et coulisses de mes séances en Suisse romande — pour préparer sereinement votre mariage, votre portrait ou votre séance grossesse.",
  },
  order: ["lieux-mariage-lavaux", "tenue-seance-grossesse", "spots-photo-couple-leman"],
  articles: {

    /* ============ ARTICLE 1 — MARIAGE / LAVAUX ============ */
    "lieux-mariage-lavaux": {
      slug: "lieux-mariage-lavaux",
      file: "journal-lieux-mariage-lavaux.html",
      category: "Mariage",
      relatedSlug: "mariage", relatedHref: "mariages.html", relatedTitle: "Mariages",
      date: "2026-04-18", dateLabel: "18 avril 2026", read: "7 min",
      title: "Où se marier en Lavaux : 8 lieux de rêve face au Léman",
      hero: "Vignobles de Lavaux en terrasses au-dessus du Léman, lumière dorée",
      heroAlt: "Mariage dans les vignobles de Lavaux au-dessus du lac Léman — Kevin Chinelli, photographe",
      excerpt: "Entre les terrasses viticoles classées à l'UNESCO et les rives du Léman, Lavaux offre quelques-uns des plus beaux décors de mariage de Suisse romande. Mon repérage, lieu par lieu.",
      metaTitle: "Où se marier en Lavaux : 8 lieux face au Léman | Kevin Chinelli",
      metaDesc: "Guide des plus beaux lieux de mariage en Lavaux et autour du Léman : domaines viticoles, terrasses et salles avec vue. Conseils d'un photographe de mariage en Suisse romande.",
      intro: "Photographier des mariages en Lavaux, c'est travailler dans l'un des plus beaux paysages de Suisse : des terrasses de vignes qui dévalent vers le lac, une lumière de fin de journée incomparable, et les Alpes en toile de fond. Voici les lieux que je recommande à mes mariés, avec un œil de photographe sur la lumière et les angles.",
      sections: [
        { h: "Pourquoi se marier en Lavaux", p: [
          "Classé au patrimoine mondial de l'UNESCO, le vignoble en terrasses de Lavaux s'étire sur une trentaine de kilomètres entre Lausanne et Montreux. C'est un décor naturel qui ne demande presque aucune décoration : les murs de pierre, les ceps alignés et le lac suffisent.",
          "Pour les photos, le grand atout reste la lumière de l'heure dorée, qui glisse sur les vignes en fin d'après-midi. Prévoyez votre [séance de couple](couple.html) à ce moment-là : c'est là que Lavaux donne le meilleur.",
        ] },
        { h: "Les domaines et lieux que je recommande", list: [
          "Le Deck à Chexbres — vue panoramique sur le lac, parfait pour un apéritif au coucher du soleil.",
          "Lavaux Vinorama à Rivaz — au bord de l'eau, idéal si vous rêvez de photos les pieds presque dans le lac.",
          "Les terrasses de Saint-Saphorin — un village de carte postale, ruelles étroites et embarcadère.",
          "Le Baron Tavernier à Chexbres — une institution avec terrasse suspendue au-dessus du vignoble.",
          "Épesses et Dézaley — pour une cérémonie laïque intime au milieu des vignes.",
          "Les quais de Cully — petit port charmant, belles lumières le matin comme le soir.",
          "Grandvaux — point de vue sur le lac et clocher emblématique.",
          "Montreux et le château de Chillon, en limite est, pour un décor plus monumental.",
        ] },
        { h: "Mes conseils de photographe", p: [
          "Réservez la lumière, pas seulement le lieu. Demandez l'heure exacte du coucher du soleil pour votre date et calez le déroulé en conséquence : idéalement, 45 minutes pour le couple juste avant le coucher. C'est aussi ce que je conseille à mes mariés pour leur [reportage de mariage](mariages.html).",
          "Anticipez la météo du lac. Le Léman crée ses propres ambiances — brume matinale, ciels changeants. J'ai toujours un plan B couvert avec mes mariés, mais sachez qu'un ciel chargé donne souvent des images plus dramatiques qu'un grand bleu uniforme.",
          "Pensez aux déplacements. Les villages de Lavaux sont escarpés et les ruelles pavées : prévoyez des chaussures confortables pour la mariée entre deux décors, et un timing réaliste si la cérémonie et la réception sont sur deux sites.",
        ] },
      ],
      closing: "Vous vous mariez en Lavaux ou ailleurs au bord du Léman ? Je connais bien la région et sa lumière. Parlons de votre projet — je ne réserve qu'un mariage par jour.",
    },

    /* ============ ARTICLE 2 — MATERNITÉ / TENUE ============ */
    "tenue-seance-grossesse": {
      slug: "tenue-seance-grossesse",
      file: "journal-tenue-seance-grossesse.html",
      category: "Maternité",
      relatedSlug: "maternite", relatedHref: "maternite-grossesse.html", relatedTitle: "Maternité & Grossesse",
      date: "2026-03-05", dateLabel: "5 mars 2026", read: "6 min",
      title: "Que porter pour une séance photo de grossesse",
      hero: "Future maman en robe fluide, lumière douce de studio",
      heroAlt: "Tenue pour une séance photo de grossesse en studio — Kevin Chinelli, photographe en Suisse romande",
      excerpt: "Robes fluides, tons neutres, matières près du corps : voici comment choisir vos tenues pour une séance grossesse réussie, en studio comme en extérieur.",
      metaTitle: "Que porter pour une séance photo de grossesse | Kevin Chinelli",
      metaDesc: "Conseils tenues pour votre séance photo de grossesse en Suisse romande : couleurs, matières, ce qui met le ventre en valeur. Par un photographe maternité.",
      intro: "« Qu'est-ce que je mets ? » C'est de loin la question qu'on me pose le plus avant une séance grossesse. Bonne nouvelle : les plus belles images viennent presque toujours de tenues simples qui mettent la silhouette en valeur sans la surcharger. Voici mes repères.",
      sections: [
        { h: "Le principe : épurer pour sublimer", p: [
          "Une séance grossesse cherche à célébrer une ligne, une courbe, un lien. Tout ce qui détourne le regard — motifs chargés, logos, coupes amples et flottantes — dessert cet objectif. On privilégie les matières près du corps qui épousent le ventre, et les tissus fluides qui captent la lumière et le mouvement.",
        ] },
        { h: "Couleurs et matières qui rendent le mieux", list: [
          "Les tons neutres et naturels : crème, beige, terracotta, vert sauge, gris doux, bleu nuit.",
          "Les matières fluides : mousseline, soie, jersey fin, maille souple — elles bougent et accrochent joliment la lumière.",
          "Le drapé et les voiles, parfaits pour des silhouettes en contre-jour (fournis au studio).",
          "Pour le ou la partenaire : des tons coordonnés, sans assortir à l'identique. Un jean brut et une chemise unie fonctionnent toujours.",
          "À éviter : motifs serrés, rayures fines, néons, logos visibles, et le total noir si la peau est très claire.",
        ] },
        { h: "Studio ou extérieur : on adapte", p: [
          "En studio, le fond est neutre et maîtrisé : une robe longue, un body simple ou un drapé suffisent. C'est l'option la plus douce et la plus intemporelle, idéale en hiver ou en fin de grossesse.",
          "En extérieur — au bord du Léman, en forêt ou dans les vignes — les robes longues et fluides prennent le vent et donnent des images vivantes. Prévoyez une seconde tenue pour varier les ambiances. Je détaille tout cela avant chaque [séance grossesse en studio ou en extérieur](maternite-grossesse.html).",
        ] },
        { h: "Le bon moment et les détails qui comptent", p: [
          "La période idéale se situe entre la 30e et la 36e semaine : le ventre est joliment arrondi et vous êtes encore à l'aise pour bouger.",
          "Pensez aux détails : une manucure soignée (on photographie souvent les mains sur le ventre), des sous-vêtements sans coutures marquées, et des chaussures faciles à retirer pour les images pieds nus. Au studio, drapés, voiles et accessoires sont à disposition.",
        ] },
      ],
      closing: "Envie d'une séance douce pour garder une trace de cette parenthèse ? Je reçois en studio chauffé en Suisse romande, seule, en couple ou avec les aînés.",
    },

    /* ============ ARTICLE 3 — COUPLE / LÉMAN ============ */
    "spots-photo-couple-leman": {
      slug: "spots-photo-couple-leman",
      file: "journal-spots-photo-couple-leman.html",
      category: "Couple",
      relatedSlug: "couple", relatedHref: "couple.html", relatedTitle: "Couple",
      date: "2026-02-10", dateLabel: "10 février 2026", read: "6 min",
      title: "Les plus beaux spots photo de couple autour du Léman",
      hero: "Couple enlacé sur un quai du Léman au coucher du soleil",
      heroAlt: "Séance photo de couple au bord du lac Léman au coucher du soleil — Kevin Chinelli, photographe",
      excerpt: "Quais de Lausanne, vignes de Lavaux, vieille ville de Genève : mes lieux préférés pour une séance couple ou fiançailles autour du lac, et la meilleure heure pour chacun.",
      metaTitle: "Spots photo de couple autour du Léman | Kevin Chinelli",
      metaDesc: "Les meilleurs lieux pour une séance photo de couple ou fiançailles autour du lac Léman : Lausanne, Lavaux, Genève, Montreux. Conseils d'un photographe en Suisse romande.",
      intro: "Une [séance couple](couple.html) n'a pas besoin d'un décor spectaculaire — juste d'un endroit où vous vous sentez bien et d'une belle lumière. Autour du Léman, on a l'embarras du choix. Voici mes lieux de prédilection, du plus urbain au plus sauvage, avec l'heure qui leur va le mieux.",
      sections: [
        { h: "Côté Lausanne et Lavaux", list: [
          "Ouchy et ses quais — le grand classique, à faire tôt le matin pour éviter la foule, ou à l'heure dorée pour les couleurs.",
          "Les escaliers du marché et la vieille ville de Lausanne — pour une ambiance plus urbaine et intime.",
          "Les vignes de Lavaux (Cully, Épesses, Saint-Saphorin) — imbattables au coucher du soleil.",
          "Le port de Pully ou de Lutry — petits ports paisibles, belles lumières de fin de journée.",
        ] },
        { h: "Côté Genève, Montreux et Riviera", list: [
          "Les Bains des Pâquis à Genève — lumière du matin et vue sur le jet d'eau.",
          "La vieille ville de Genève et la promenade de la Treille — ruelles, escaliers, marronniers.",
          "Le quai de Montreux et ses massifs fleuris — romantique, avec les Alpes en fond.",
          "Le château de Chillon et ses abords — pour une touche plus monumentale.",
        ] },
        { h: "Bien choisir son heure", p: [
          "L'heure dorée, juste avant le coucher du soleil, reste la valeur sûre : lumière chaude, ombres douces, ambiance enveloppante. La lumière du matin, plus fraîche et plus calme, est idéale si vous voulez éviter le monde sur les quais.",
          "Évitez le plein midi en été : la lumière est dure et les contrastes peu flatteurs. Si c'est le seul créneau possible, on cherchera l'ombre des arcades ou des arbres.",
        ] },
        { h: "Et s'il fait gris ?", p: [
          "Un ciel couvert agit comme une immense boîte à lumière : les portraits y sont doux et homogènes. La météo romande étant ce qu'elle est, je garde toujours une alternative en tête — un passage en vieille ville, sous une arcade, ou une séance plus intimiste à l'intérieur.",
        ] },
      ],
      closing: "Fiançailles, anniversaire de rencontre ou simple envie d'une belle trace : on choisit ensemble le lieu et l'heure qui vous ressemblent. Beaucoup de couples en profitent aussi pour leur faire-part de mariage.",
    },
  },
};

;
(()=>{const A=window.KC_JOURNAL.articles[window.KC_ARTICLE],J_ALL=window.KC_JOURNAL;function RichText({text}){const parts=[],re=/\[([^\]]+)\]\(([^)]+)\)/g;let last=0,m,k=0;for(;(m=re.exec(text))!==null;)m.index>last&&parts.push(text.slice(last,m.index)),parts.push(React.createElement("a",{key:k++,href:m[2],className:"art-ilink"},m[1])),last=m.index+m[0].length;return last<text.length&&parts.push(text.slice(last)),React.createElement(React.Fragment,null,parts)}function ArticleApp(){const[t,setTweak]=useTweaks({palette:KC.PALETTES["Noir chaud"],heading:"Cinzel",body:"Jost"});useApplyTweaks(t),useReveal([]);const others=J_ALL.order.filter(s=>s!==A.slug).map(s=>J_ALL.articles[s]).slice(0,2);return React.createElement(React.Fragment,null,React.createElement("div",{className:"grain"}),React.createElement(Nav,{active:"journal"}),React.createElement("main",null,React.createElement("article",null,React.createElement("header",{className:"art-hero"},React.createElement("div",{className:"bg"},React.createElement(Slot,{id:"art-hero-"+A.slug,ph:A.hero,alt:A.heroAlt,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"scrim"}),React.createElement("div",{className:"art-hero-content"},React.createElement("div",{className:"crumb reveal in"},React.createElement("a",{href:KC.HOME},"Accueil"),React.createElement("span",null,"/"),React.createElement("a",{href:"journal.html"},"Journal"),React.createElement("span",null,"/"),React.createElement("span",null,A.category)),React.createElement("h1",{className:"reveal in d1"},A.title),React.createElement("div",{className:"art-meta reveal in d2"},React.createElement("span",null,A.dateLabel),React.createElement("span",{className:"jl-dot"},"\xB7"),React.createElement("span",null,A.read," de lecture")))),React.createElement("div",{className:"sec s-light pad-y"},React.createElement("div",{className:"wrap-narrow art-body"},React.createElement("p",{className:"art-lead reveal"},React.createElement(RichText,{text:A.intro})),A.sections.map((s,i)=>React.createElement("section",{key:i,className:"art-section reveal"},React.createElement("h2",null,s.h),s.p&&s.p.map((p,j)=>React.createElement("p",{key:j},React.createElement(RichText,{text:p}))),s.list&&React.createElement("ul",{className:"art-list"},s.list.map((li,j)=>React.createElement("li",{key:j},React.createElement(RichText,{text:li})))))),React.createElement("div",{className:"art-closing reveal"},React.createElement("p",null,A.closing),React.createElement("a",{href:A.relatedHref,className:"link-arrow"},"D\xE9couvrir mes s\xE9ances ",A.relatedTitle.toLowerCase()," ",React.createElement("span",{className:"ar"},"\u2192"))))),React.createElement("section",{className:"sec s-dark pad-y"},React.createElement("div",{className:"wrap"},React.createElement(Overline,{className:"reveal",style:{justifyContent:"center"}},"\xC0 lire aussi"),React.createElement("div",{className:"journal-list two",style:{marginTop:"clamp(30px,4vw,52px)"}},others.map((o,i)=>React.createElement("a",{key:o.slug,href:o.file,className:"jl-card reveal d"+(i+1)},React.createElement("div",{className:"jl-img"},React.createElement(Slot,{id:"rel-art-"+o.slug,ph:o.hero,alt:o.heroAlt,style:{width:"100%",height:"100%"}})),React.createElement("div",{className:"jl-body"},React.createElement("div",{className:"jl-meta"},React.createElement("span",{className:"jl-cat"},o.category)),React.createElement("h2",null,o.title),React.createElement("span",{className:"link-arrow"},"Lire l'article ",React.createElement("span",{className:"ar"},"\u2192"))))))))),React.createElement(CtaContact,{title:"R\xE9servez votre s\xE9ance."})),React.createElement(Footer,null))}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ArticleApp,null));})();

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
