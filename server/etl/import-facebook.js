import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');
const name = 'RAW_FACEBOOK_MO_COLOMBIA_MAR26.csv';
const source = process.argv[2] ?? join(homedir(), 'Downloads', name);
const output = new URL('../../storage/radar-usados/', import.meta.url);
const normalize = (value) => String(value ?? '').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (value) => normalize(value).replaceAll(' ', '');

function identifyVersion(title) {
  return title.match(/\b(grand touring lx|grand touring|touring|txl)\b/)?.[1] ?? '';
}

function fingerprint(ad) {
  const fields = [ad.marca, ad.modelo, ad.ano, ad.ciudad, ad.version, ad.precio, ad.kilometraje];
  return fields.every((value) => String(value ?? '').trim()) ? fields.map(compact).join('|') : null;
}

function positiveInteger(value) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

const vtn = new URL('vendetunave.json', output);
if (!existsSync(vtn)) throw new Error('Ejecuta primero server/etl/import-usados.js.');
const { anuncios } = JSON.parse(readFileSync(vtn, 'utf8'));
const catalog = new Map();
const signatures = new Set();
for (const ad of anuncios) {
  const brand = normalize(ad.marca);
  if (!catalog.has(brand)) catalog.set(brand, new Map());
  const model = compact(ad.modelo);
  if (model.length >= 2) catalog.get(brand).set(model, ad.modelo);
  const signature = fingerprint({ ...ad, version: identifyVersion(normalize(ad.title)) });
  if (signature) signatures.add(signature);
}

const parsed = Papa.parse(readFileSync(source, 'utf8'), { header: true, skipEmptyLines: 'greedy' });
if (parsed.errors.length) throw new Error(parsed.errors[0].message);
const stats = { filas: parsed.data.length, lineaYVersion: 0, soloLinea: 0, lineaAmbigua: 0,
  conDatosBasicos: 0, posiblesDuplicadosVendeTuNave: 0, idsRepetidos: 0 };
const records = [];
const ids = new Set();

for (const row of parsed.data) {
  const title = normalize(row.titulo_de_publicacion);
  const models = catalog.get(normalize(row.marca)) ?? new Map();
  const words = title.split(' ');
  const tokens = new Set(words);
  for (let i = 0; i < words.length - 1; i++) tokens.add(words[i] + words[i + 1]);
  const matched = [...models.keys()].filter((model) => tokens.has(model));
  const model = matched.length === 1 ? models.get(matched[0]) : '';
  const version = identifyVersion(title);
  if (!model) stats.lineaAmbigua++;
  else if (!version) stats.soloLinea++;
  else stats.lineaYVersion++;

  const id = row.post_ID.trim();
  if (id && ids.has(id)) {
    stats.idsRepetidos++;
    continue;
  }
  if (id) ids.add(id);

  const ad = {
    fuente: 'Facebook Marketplace', id, marca: row.marca.trim(), modelo: model, version,
    ano: row.ano.trim(), ciudad: row.municipio.trim(), precio: row.precio.trim().replace(/^COP\s+/i, ''),
    kilometraje: row.kilometraje.trim(), transmision: row.transmision.trim(),
  };
  const signature = fingerprint(ad);
  const possibleDuplicate = Boolean(signature && signatures.has(signature));
  if (possibleDuplicate) stats.posiblesDuplicadosVendeTuNave++;
  let url = '';
  try {
    const link = new URL(row.url);
    if (link.protocol === 'https:' && /(^|\.)facebook\.com$/.test(link.hostname)) {
      link.search = '';
      link.hash = '';
      url = link.href;
    }
  } catch { /* enlace ausente o inválido */ }
  const basic = Boolean(model && version && id && url && ad.ciudad && /^\d{4}$/.test(ad.ano) &&
    positiveInteger(ad.precio) && positiveInteger(ad.kilometraje) &&
    !/\b(cuota|anticipo|inicial)\b/.test(title));
  if (basic) stats.conDatosBasicos++;
  records.push({ ...ad, url, datosBasicos: basic, posibleDuplicadoVendeTuNave: possibleDuplicate });
}

mkdirSync(output, { recursive: true });
writeFileSync(new URL('facebook.json', output), JSON.stringify({ archivo: name, resumen: stats, anuncios: records }));
console.table(stats);

