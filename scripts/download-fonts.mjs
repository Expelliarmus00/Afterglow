/* Télécharge les polices Google Fonts en local (WOFF2) et génère fonts/fonts.css.
   Appelé par build.mjs — skipped si fonts/fonts.css est déjà à jour.
   Usage standalone : node scripts/download-fonts.mjs --force */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS_DIR = resolve(root, "fonts");
const FONTS_CSS = resolve(FONTS_DIR, "fonts.css");

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600" +
  "&family=Cormorant+Garamond:ital,wght@1,400;1,500" +
  "&family=Jost:wght@300;400;500" +
  "&display=swap";

// UA moderne → Google Fonts renvoi du WOFF2
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

export async function downloadFonts(force = false) {
  if (!force && existsSync(FONTS_CSS)) {
    console.log("  polices locales déjà présentes (fonts/fonts.css), skip.");
    return;
  }

  mkdirSync(FONTS_DIR, { recursive: true });

  console.log("  Téléchargement des polices depuis Google Fonts…");

  // 1) Récupérer la feuille de style Google (liste des @font-face WOFF2)
  const cssRes = await fetch(GOOGLE_FONTS_URL, { headers: { "User-Agent": UA } });
  if (!cssRes.ok) throw new Error(`Google Fonts CSS : ${cssRes.status}`);
  let css = await cssRes.text();

  // 2) Extraire toutes les URL WOFF2
  const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
  const urls = [...css.matchAll(urlRe)].map((m) => m[1]);
  if (urls.length === 0) throw new Error("Aucune URL WOFF2 trouvée dans la CSS Google Fonts");

  // 3) Télécharger chaque fichier WOFF2 → fonts/[hash-filename].woff2
  const urlToLocal = {};
  for (const url of urls) {
    // Nom de fichier depuis le hash dans l'URL gstatic
    const parts = url.split("/");
    const filename = parts[parts.length - 1]; // ex: abc123.woff2
    const localPath = resolve(FONTS_DIR, filename);

    if (!existsSync(localPath)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Téléchargement ${filename} : ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(localPath, buf);
      console.log(`    ✓ fonts/${filename}`);
    } else {
      console.log(`    · fonts/${filename} (déjà présent)`);
    }
    // Chemin relatif au fichier fonts/fonts.css (pas de préfixe fonts/)
    urlToLocal[url] = filename;
  }

  // 4) Réécrire la CSS avec les chemins locaux
  const localCss = css.replace(urlRe, (_m, url) => `url(${urlToLocal[url]})`);
  writeFileSync(FONTS_CSS, localCss);
  console.log(`  ✅ fonts/fonts.css écrit (${urls.length} fichiers WOFF2)`);
}

// Exécution standalone
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes("--force");
  downloadFonts(force).catch((e) => { console.error(e); process.exit(1); });
}
