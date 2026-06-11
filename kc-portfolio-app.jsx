/* ============================================================
   KEVIN CHINELLI — Portfolio page app
   Filterable gallery. All cells stay mounted (filter toggles a .hide
   class) so dropped images persist when switching categories. The
   lightbox (kc-lightbox.js) reads only the visible filled slots.
   Loaded after kc-shared.jsx.
   ============================================================ */
const { useState } = React;

const PF_CATS = [
  { key: "all",       label: "Tout" },
  { key: "mariage",   label: "Mariages" },
  { key: "portrait",  label: "Portraits" },
  { key: "studio",    label: "Studio" },
  { key: "maternite", label: "Maternité" },
  { key: "couple",    label: "Couple" },
];

const PF_ITEMS = [
  { id: "pf-1",  cat: "mariage",   ph: "Mariage — cérémonie" },
  { id: "pf-2",  cat: "couple",    ph: "Couple — golden hour" },
  { id: "pf-3",  cat: "studio",    ph: "Studio — portrait éditorial" },
  { id: "pf-4",  cat: "maternite", ph: "Maternité — lumière douce" },
  { id: "pf-5",  cat: "mariage",   ph: "Mariage — préparatifs" },
  { id: "pf-6",  cat: "couple",    ph: "Couple — complicité" },
  { id: "pf-7",  cat: "studio",    ph: "Studio — corporate" },
  { id: "pf-8",  cat: "mariage",   ph: "Mariage — première danse" },
  { id: "pf-9",  cat: "maternite", ph: "Maternité — en couple" },
  { id: "pf-10", cat: "studio",    ph: "Studio — clair-obscur" },
  { id: "pf-11", cat: "couple",    ph: "Couple — en extérieur" },
  { id: "pf-12", cat: "mariage",   ph: "Mariage — détails du lieu" },
  { id: "pf-13", cat: "maternite", ph: "Maternité — silhouette" },
  { id: "pf-14", cat: "studio",    ph: "Studio — noir & blanc" },
  { id: "pf-15", cat: "couple",    ph: "Couple — tendresse" },
  { id: "pf-16", cat: "mariage",   ph: "Mariage — sortie de cérémonie" },
  { id: "pf-17", cat: "maternite", ph: "Maternité — détail intime" },
  { id: "pf-18", cat: "studio",    ph: "Studio — attitude" },
  { id: "pf-19", cat: "portrait",  ph: "Portrait — lumière naturelle" },
  { id: "pf-20", cat: "portrait",  ph: "Portrait — extérieur" },
  { id: "pf-21", cat: "portrait",  ph: "Portrait — regard franc" },
  { id: "pf-22", cat: "portrait",  ph: "Portrait — noir & blanc" },
];

function PortfolioApp() {
  const [t, setTweak] = useTweaks({
    palette: KC.PALETTES["Noir chaud"],
    heading: "Cinzel",
    body: "Jost",
  });
  const [cat, setCat] = useState("all");
  useApplyTweaks(t);
  useReveal([cat]);

  return (
    <>
      <div className="grain"></div>
      <Nav active="portfolio" />
      <main>
        <section className="pf-head s-dark">
          <div className="wrap">
            <Overline className="reveal">Portfolio</Overline>
            <h1 className="display reveal d1">Travaux choisis.</h1>
            <p className="reveal d2">
              Une sélection d'images à travers les mariages, les couples, le studio et la maternité.
              Cliquez sur une photo pour l'agrandir.
            </p>
            <div className="pf-filters reveal d2">
              {PF_CATS.map((c) => (
                <button
                  key={c.key}
                  className={"pf-filter" + (cat === c.key ? " active" : "")}
                  onClick={() => setCat(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sec s-dark" style={{ paddingBottom: "clamp(90px,12vw,170px)" }}>
          <div className="wrap">
            <div className="pf-grid" data-lb-group="portfolio">
              {PF_ITEMS.map((it) => (
                <div key={it.id} className={"pf-cell" + (cat === "all" || it.cat === cat ? "" : " hide")}>
                  <Slot id={it.id} ph={it.ph} style={{ width: "100%", height: "100%" }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <CtaContact overline="Une séance en tête ?" title="Réservez votre date." />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PortfolioApp />);
