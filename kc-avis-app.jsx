/* ============================================================
   KEVIN CHINELLI — Avis clients (avis.html)
   Aggregates testimonials from window.KC_PRESTA + Google CTA.
   ⚠️ Replace GOOGLE_REVIEWS_URL with the real Google Business link.
   ============================================================ */
const GOOGLE_REVIEWS_URL = "https://search.google.com/local/writereview"; // ⚠️ placeholder

const ALL_REVIEWS = (function () {
  const cats = { mariage: "Mariage", portrait: "Portrait", studio: "Studio", maternite: "Maternité", couple: "Couple" };
  const out = [];
  Object.keys(window.KC_PRESTA).forEach((slug) => {
    (window.KC_PRESTA[slug].testimonials || []).forEach((t) => {
      out.push({ quote: t.quote, who: t.who, cat: cats[slug] || "", href: window.KC_PRESTA[slug].slug });
    });
  });
  return out;
})();

function AvisApp() {
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
      <Nav active="avis" />
      <main>
        <section className="sec s-dark pf-head">
          <div className="wrap">
            <Overline className="reveal">Avis clients</Overline>
            <h1 className="display reveal d1">Ils m'ont fait confiance.</h1>
            <p className="reveal d1">Mariés, familles, futures mamans et professionnels de toute la Suisse romande — voici ce qu'ils retiennent de nos séances. La meilleure façon de savoir si l'on s'entendra.</p>
            <div className="avis-stars reveal d1">
              <span className="stars" aria-hidden="true">★★★★★</span>
              <span>5,0 / 5 — sur l'ensemble des retours clients</span>
            </div>
          </div>
        </section>

        <section className="sec s-light pad-y">
          <div className="wrap">
            <div className="avis-grid">
              {ALL_REVIEWS.map((r, i) => (
                <figure key={i} className={"avis-card reveal d" + ((i % 3) + 1)}>
                  <span className="stars" aria-hidden="true">★★★★★</span>
                  <blockquote>{r.quote}</blockquote>
                  <figcaption>
                    <span className="who">{r.who}</span>
                    <a className="cat" href={r.href + (r.href === "maternite" ? "-grossesse" : "") + ".html"}>{r.cat}</a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="sec s-darker pad-y">
          <div className="wrap" style={{ textAlign: "center" }}>
            <Overline className="reveal" style={{ justifyContent: "center" }}>Votre avis compte</Overline>
            <h2 className="display reveal d1" style={{ fontSize: "clamp(28px,3.6vw,52px)", margin: "20px 0 16px" }}>Vous avez travaillé avec moi&nbsp;?</h2>
            <p className="reveal d1" style={{ color: "var(--muted)", maxWidth: "52ch", margin: "0 auto clamp(28px,4vw,42px)" }}>
              Partager votre expérience sur Google aide d'autres couples et familles à franchir le pas. Merci du fond du cœur.
            </p>
            <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener" className="link-arrow reveal d2" style={{ fontSize: "14px" }}>
              Laisser un avis sur Google <span className="ar">→</span>
            </a>
          </div>
        </section>
        <CtaContact title="Écrivons votre histoire." />
      </main>
      <Footer />
      <TweaksBase t={t} setTweak={setTweak} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AvisApp />);
