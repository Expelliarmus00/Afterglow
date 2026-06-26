/* ============================================================
   KEVIN CHINELLI — À propos page app
   Loaded after kc-shared.jsx.
   ============================================================ */
const VALUES = [
  { n: "01", t: "La vérité avant la pose", p: "Je cherche l'instant non rejoué — un regard, un rire, un silence. Mon travail est d'être présent sans jamais peser, pour que l'émotion reste entière." },
  { n: "02", t: "La lumière, toujours", p: "Naturelle ou maîtrisée en studio, la lumière est mon premier sujet. Elle sculpte, révèle et donne à chaque image sa profondeur et son intemporalité." },
  { n: "03", t: "Un accompagnement entier", p: "De la première rencontre à la livraison de vos tirages, je vous accompagne avec soin. Chaque projet est unique et mérite une attention sur mesure." },
];

const AP_FACTS = [
  { k: "Basé à", v: "Suisse romande" },
  { k: "Depuis", v: "Près de 10 ans" },
  { k: "Spécialités", v: "Mariage · Studio · Famille" },
];

function ApHero() {
  return (
    <section className="phero bas">
      <div className="bg">
        <Slot id="about-photo" ph="Kevin Chinelli — photographe en Suisse romande" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} />
        <Slot id="about-photo-mobile" ph="Kevin Chinelli — portrait" loading="eager" fetchpriority="high" style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="scrim"></div>
      <div className="phero-content">
        <div className="crumb reveal in"><a href={KC.HOME}>Accueil</a><span>/</span><span>À propos</span></div>
        <h1 className="reveal in d1">Kevin Chinelli</h1>
        <p className="hint reveal in d2">« Les moments qui comptent ne se mettent pas en scène. »</p>
      </div>
    </section>
  );
}

function ApIntro() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap-narrow ap-intro">
        <Overline className="reveal">Le photographe</Overline>
        <p className="ap-lead reveal d1">
          Mon travail, c'est d'être là — attentif, discret, à l'écoute — au moment exact où
          quelque chose de vrai se passe. Partout où une histoire mérite d'être racontée, avec
          patience et le souci constant du détail.
        </p>
        <div className="ap-facts reveal d2">
          {AP_FACTS.map((f, i) => (
            <div key={i} className="ap-fact">
              <div className="ap-fact-k">{f.k}</div>
              <div className="ap-fact-v">{f.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Values() {
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ textAlign: "center", marginBottom: "clamp(44px,5vw,72px)" }}>
          <Overline className="reveal" style={{ justifyContent: "center" }}>Ma démarche</Overline>
          <h2 className="display reveal d1" style={{ fontSize: "clamp(30px,4vw,56px)", marginTop: "20px" }}>Trois convictions.</h2>
        </div>
        <div className="values">
          {VALUES.map((v, i) => (
            <div key={i} className={"value reveal d" + (i + 1)}>
              <span className="vn">{v.n}</span>
              <h4>{v.t}</h4>
              <p>{v.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuoteBand() {
  return (
    <section className="sec s-light pad-y">
      <div className="wrap">
        <blockquote className="ap-quote reveal">
          « Une photographie réussie, c'est un souvenir qui respire encore, des années plus tard. »
        </blockquote>
      </div>
    </section>
  );
}

function StudioStrip() {
  return (
    <section className="sec s-dark pad-y">
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "clamp(30px,4vw,52px)", flexWrap: "wrap", gap: "18px" }}>
          <div>
            <Overline className="reveal">L'atelier</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(26px,3vw,44px)", marginTop: "16px" }}>Là où naissent les images.</h2>
          </div>
          <a href="portfolio.html" className="link-arrow reveal d1">Voir le portfolio <span className="ar">→</span></a>
        </div>
        <div className="gal reveal d1" data-lb-group="atelier">
          <div className="cell"><Slot id="ap-studio-1" ph="Mariage — instant d'émotion" style={{ width: "100%", height: "100%" }} /></div>
          <div className="stack">
            <div className="cell"><Slot id="ap-studio-2" ph="Portrait — lumière naturelle" style={{ width: "100%", height: "100%" }} /></div>
            <div className="cell"><Slot id="ap-studio-3" ph="Maternité — douceur de l'attente" style={{ width: "100%", height: "100%" }} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  useApplyTweaks(t);
  useReveal([]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="apropos" />
      <main>
        <ApHero />
        <ApIntro />
        <Values />
        <QuoteBand />
        <StudioStrip />
        <CtaContact overline="Travaillons ensemble" title="Racontons votre histoire." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ApApp />);
