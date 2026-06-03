/* Pré-compile chaque .jsx (source) en .js classique minifié, chargé tel quel
   par les pages HTML. Remplace la transpilation Babel dans le navigateur.

   - Sémantique « classic script » préservée : pas de bundling, pas d'IIFE, on
     transforme fichier par fichier. Le partage inter-fichiers se fait via
     window (Object.assign dans kc-shared.jsx / tweaks-panel.jsx).
   - minifyIdentifiers DÉSACTIVÉ : aucun symbole global ne doit être renommé.
   Usage : npm run build */
import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ENTRIES = [
  "tweaks-panel.jsx",
  "kc-shared.jsx",
  "kc-app.jsx",
  "kc-apropos-app.jsx",
  "kc-article-app.jsx",
  "kc-avis-app.jsx",
  "kc-contact-app.jsx",
  "kc-journal-app.jsx",
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
