/* Extrait les images base64 de .image-slots.state.json vers des fichiers
   réels dans images/, et réécrit le JSON pour ne garder que les chemins.
   Usage : node scripts/extract-images.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = resolve(root, ".image-slots.state.json");
const imagesDir = resolve(root, "images");
mkdirSync(imagesDir, { recursive: true });

const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/avif": "avif", "image/gif": "gif" };
const state = JSON.parse(readFileSync(statePath, "utf8"));
let extracted = 0, bytesBefore = 0, bytesAfter = 0;

for (const [key, val] of Object.entries(state)) {
  const u = typeof val === "string" ? val : val && val.u;
  const m = typeof u === "string" && u.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) continue;
  const ext = EXT[m[1].toLowerCase()] || "bin";
  const buf = Buffer.from(m[2], "base64");
  bytesBefore += u.length;
  const fname = `${key}.${ext}`;
  writeFileSync(resolve(imagesDir, fname), buf);
  const rel = `images/${fname}`;
  bytesAfter += rel.length;
  if (typeof val === "string") state[key] = rel;
  else val.u = rel;
  extracted++;
}

writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log(`✅ ${extracted} images extraites vers images/`);
console.log(`   base64 dans le JSON : ${(bytesBefore / 1024).toFixed(0)} Ko → chemins : ${bytesAfter} o`);
