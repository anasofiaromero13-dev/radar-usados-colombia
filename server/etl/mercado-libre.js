import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import Papa from 'papaparse';

const file = new URL('../../storage/radar-usados/mercado-libre.json', import.meta.url);
const key = (v) => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (v) => key(v).replaceAll(' ', '');
const family = (v) => key(v).match(/\b(grand touring lx|grand touring|touring|txl)\b/)?.[1] ?? '';
const columns = ['Marca', 'Modelo', 'Versión', 'Año', 'Transmisión', 'Combustible', 'Rango KM', 'Precio Mín.', 'Precio Med.', 'Precio Máx.'];

function importar(source) {
  if (!source) throw new Error('Indica la ruta del CSV del Informe de Precios.');
  const parsed = Papa.parse(fs.readFileSync(source, 'utf8'), { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.length || !columns.every((column) => parsed.meta.fields.includes(column))) {
    throw new Error('CSV inválido o columnas inesperadas.');
  }

  const rows = [];
  for (const row of parsed.data) {
    const tramo = row['Rango KM'].match(/^([\d.]+)\s*km\s*-\s*([\d.]+)\s*km$/i);
    if (!tramo) continue;
    const [desde, hasta] = tramo.slice(1).map((v) => Number(v.replaceAll('.', '')));
    const [minimo, mediana, maximo] = columns.slice(7).map((column) => Number(row[column]));
    if (![desde, hasta, minimo, mediana, maximo].every(Number.isSafeInteger) ||
        desde < 0 || hasta < desde || minimo <= 0 || minimo > mediana || mediana > maximo) continue;
    const [marca, modelo, version, ano, transmision, combustible] = columns.slice(0, 6).map((column) => row[column].trim());
    if (![marca, modelo, version, ano].every(Boolean)) continue;
    rows.push({ marca, modelo, version, ano, transmision, combustible, desde, hasta, minimo, mediana, maximo });
  }

  fs.mkdirSync(new URL('.', file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  console.log('Mercado Libre:', parsed.data.length, 'filas leídas,', rows.length, 'referencias válidas.');
}

let cached;
let modified;
export function consultarMercadoLibre({ marca, modelo, ano, version, kilometraje }) {
  if (!version || !fs.existsSync(file)) return null;
  const timestamp = fs.statSync(file).mtimeMs;
  if (!cached || timestamp !== modified) {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    modified = timestamp;
  }
  const km = Number(kilometraje);
  const requested = key(version);
  const matches = cached.filter((row) =>
    compact(row.marca) === compact(marca) && compact(row.modelo) === compact(modelo) &&
    row.ano === ano.trim() && km >= row.desde && km <= row.hasta &&
    (key(row.version) === requested || family(row.version) === requested)
  );
  return { total: matches.length, filas: matches.slice(0, 12) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) importar(process.argv[2]);
