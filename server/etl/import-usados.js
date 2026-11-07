import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Papa from 'papaparse';

const sourceName = 'vendetunave_full_20260522.csv';
const sourcePath = join(homedir(), 'Downloads', sourceName);
const csv = readFileSync(sourcePath, 'utf8');

const { data, errors, meta } = Papa.parse(csv, {
  header: true,
  skipEmptyLines: 'greedy',
  transformHeader: (header) => header.trim(),
});

if (errors.length > 0) {
  throw new Error(`Error al leer ${sourceName}: ${errors[0].message}`);
}

const fields = [
  'id', 'fecha_scraping', 'fecha_publicacion', 'url_publicacion',
  'title', 'marca', 'modelo', 'ano', 'ciudad', 'departamento',
  'precio', 'tipo_precio', 'kilometraje', 'condicion', 'blindado',
  'combustible', 'transmision', 'cilindraje_cc',
];

const missing = fields.filter((field) => !meta.fields.includes(field));
if (missing.length > 0) {
  throw new Error(`Faltan columnas en ${sourceName}: ${missing.join(', ')}`);
}

const listings = data.map((row) => ({
  fuente: 'VendeTuNave',
  ...Object.fromEntries(fields.map((field) => [field, row[field].trim()])),
}));

const outputDir = new URL('../../storage/radar-usados/', import.meta.url);
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  new URL('vendetunave.json', outputDir),
  JSON.stringify({ archivo: sourceName, anuncios: listings }),
  'utf8',
);

const normalize = (value) => value.toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');

const sample = listings.filter((row) =>
  normalize(row.marca) === 'mazda' &&
  normalize(row.modelo) === 'cx30' &&
  row.ano === '2022' &&
  normalize(row.ciudad) === 'medellin'
);

console.log(`VendeTuNave: ${listings.length} registros importados`);
console.log(`Mazda CX-30 2022 en Medellín: ${sample.length} registros de origen`);
console.table(sample.slice(0, 3).map(({ title, precio, url_publicacion }) => ({
  title, precio, url_publicacion,
})));