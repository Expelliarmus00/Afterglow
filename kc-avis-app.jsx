/* ============================================================
   KEVIN CHINELLI — Avis clients (avis.html)
   Aggregates testimonials from window.KC_PRESTA + Google CTA.
   ⚠️ Replace GOOGLE_REVIEWS_URL with the real Google Business link.
   ============================================================ */
const GOOGLE_REVIEWS_URL = "https://search.google.com/local/writereview"; // ⚠️ placeholder

const ALL_REVIEWS = (function () {
  const cats = { mariage: "Mariage", portrait: "Portrait", studio: "Studio", maternite: "Maternité", couple: "Couple", famille: "Famille" };
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
            <h1 className="display reveal d1">Bientôt vos mots ici.</h1>
            <p className="reveal d1">Afterglow démarre — les premières séances arrivent. Les retours de mes clients prendront place ici au fur et à mesure, avec authenticité. En attendant, le meilleur moyen de vous faire une idée reste d'échanger directement avec moi.</p>
          </div>
        </section>

        {/* Grille d'avis — réactiver quand de VRAIS témoignages clients seront disponibles.
            Les données dans kc-presta-data.js doivent alors refléter de vrais retours.
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
        */}

        <CtaContact overline="Parlons de votre projet" title="Discutons de votre séance." />
      </main>
      <Footer />
      <TweaksBase t={t} setTweak={setTweak} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AvisApp />);
