/* Pré-compile chaque .jsx (source) en .js classique minifié, chargé tel quel
   par les pages HTML. Remplace la transpilation Babel dans le navigateur.

   - Sémantique « classic script » préservée : pas de bundling, pas d'IIFE, on
     transforme fichier par fichier. Le partage inter-fichiers se fait via
     window (Object.assign dans kc-shared.jsx / tweaks-panel.jsx).
   - minifyIdentifiers DÉSACTIVÉ : aucun symbole global ne doit être renommé.
   Usage : npm run build */
import { build, transform } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { prerenderAll } from "./prerender.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- CSS : minifie chaque feuille en .min.css (référencée par les pages) ---
const CSS = ["kc.css", "kc-pages.css"];
for (const file of CSS) {
  const css = readFileSync(resolve(root, file), "utf8");
  const out = await transform(css, { loader: "css", minify: true });
  const min = file.replace(/\.css$/, ".min.css");
  writeFileSync(resolve(root, min), out.code);
  console.log(`  ${file} → ${min} (${(out.code.length / 1024).toFixed(1)} Ko)`);
}

const ENTRIES = [
  "tweaks-panel.jsx",
  "kc-shared.jsx",
  "kc-app.jsx",
  "kc-apropos-app.jsx",
  "kc-article-app.jsx",
  "kc-avis-app.jsx",
  "kc-contact-app.jsx",
  "kc-journal-app.jsx",
  "kc-legal-app.jsx",
  "kc-portfolio-app.jsx",
  "kc-presta-app.jsx",
  "kc-tarifs-app.jsx",
  "kc-ville-app.jsx",
];

await build({
  entryPoints: ENTRIES.map((f) => resolve(root, f)),
  outdir: root,
  outExtension: { ".js": ".js" },
  bundle: false,            // transform-only : un fichier .js par fichier .jsx
  // IIFE : chaque fichier garde ses const/let dans sa propre portée. Sans ça,
  // les `const {useState} = React` en tête de plusieurs fichiers entrent en
  // collision dans l'environnement lexical global partagé des classic scripts
  // (« Identifier already declared »). Le partage inter-fichiers passe par
  // window (Object.assign dans kc-shared.js / tweaks-panel.js), pas par la portée.
  format: "iife",
  loader: { ".jsx": "jsx" },
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false, // critique : ne pas renommer les globals
  legalComments: "none",
  target: "es2019",
  logLevel: "info",
});

console.log("✅ JSX pré-compilé en .js");

// Pré-rendu SSG : injecte le HTML React dans #root (doit tourner APRÈS la
// compilation des .js, car il les exécute côté Node).
const htmlFiles = readdirSync(root).filter((f) => f.endsWith(".html"));
prerenderAll(root, htmlFiles);

// Stamp a ?v=YYYYMMDD querystring on every local JS/CSS reference in all HTML
// files so browser caches are invalidated after each deployment.
const version = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const assetRe = /(<(?:script|link)[^>]+(?:src|href)=")((?:(?:lib|kc|tweaks|image-slot|kc-)[^"?]*|kc\.min\.css|kc-pages\.min\.css)[^"?]*)(\?v=[^"]*)?(")([^>]*>)/g;
let stampCount = 0;
for (const htmlFile of htmlFiles) {
  const fp = resolve(root, htmlFile);
  const original = readFileSync(fp, "utf8");
  const stamped = original.replace(assetRe, (_, pre, path, _v, quote, post) =>
    `${pre}${path}?v=${version}${quote}${post}`
  );
  if (stamped !== original) { writeFileSync(fp, stamped); stampCount++; }
}
console.log(`✅ Cache version ${version} appliquée (${stampCount} fichiers HTML)`);
