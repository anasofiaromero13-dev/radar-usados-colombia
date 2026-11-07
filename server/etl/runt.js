import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

const file = new URL('../../storage/radar-usados/runt.json', import.meta.url);
const key = (v) => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const cityKey = (v) => ({ bogotadc: 'bogota', santiagodecali: 'cali' }[key(v)] ?? key(v));
const reference = (marca, modelo, ano, ciudad) =>
  [key(marca), key(modelo), String(ano).trim(), cityKey(ciudad)].join('|');

function monthOf(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 7);
  if (typeof value === 'number' && value >= 20000 && value <= 60000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 7);
  }
  const iso = String(value ?? '').trim().match(/^(\d{4})[-/](0?[1-9]|1[0-2])[-/]\d{1,2}(?:$|[ T])/);
  if (iso) return iso[1] + '-' + iso[2].padStart(2, '0');
  const local = String(value ?? '').trim().match(/^\d{1,2}[-/](0?[1-9]|1[0-2])[-/](\d{4})(?:$|[ T])/);
  return local ? local[2] + '-' + local[1].padStart(2, '0') : null;
}

async function importar(source) {
  if (!source) throw new Error('Indica la ruta del Excel de RUNT.');
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(source, { sharedStrings: 'cache', styles: 'cache' });
  const groups = {};
  const explorer = new Map();
  let leidas = 0;
  let validas = 0;
  let desde = null;
  let hasta = null;
  let found = false;
  const headers = ['Marca Vehículo', 'Línea vehículo', 'Modelo Vehículo', 'Ciudad Traspaso', 'Fecha Traspaso', 'Departamento Traspaso', 'Clase Vehículo', 'Tipo Combustible'].map(key);

  for await (const sheet of reader) {
    let columns;
    for await (const row of sheet) {
      if (!columns) {
        columns = headers.map((header) => row.values.findIndex((v) => key(v) === header));
        if (columns.some((i) => i < 1)) break;
        found = true;
        continue;
      }
      leidas++;
      const [marca, modelo, ano, ciudad, fecha, departamento, clase, combustible] = columns.map((column) => row.getCell(column).value);
      const month = monthOf(fecha);
      if (![marca, modelo, ciudad].every(key) || !/^\d{4}$/.test(String(ano).trim()) || !month) continue;
      const id = reference(marca, modelo, ano, ciudad);
      const group = groups[id] ??= {};
      group[month] = (group[month] ?? 0) + 1;
      const dimensions = [month, departamento, ciudad, marca, modelo, ano, clase, combustible]
        .map((value) => String(value ?? '').trim());
      const dimensionKey = JSON.stringify(dimensions.map(key));
      const entry = explorer.get(dimensionKey) ?? [...dimensions, 0];
      entry[8]++;
      explorer.set(dimensionKey, entry);
      validas++;
      if (!desde || month < desde) desde = month;
      if (!hasta || month > hasta) hasta = month;
    }
  }

  if (!found || !validas) throw new Error('El Excel no produjo traspasos con referencia, ciudad y fecha válidas.');
  fs.mkdirSync(new URL('.', file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ periodo: { desde, hasta }, groups }));
  fs.writeFileSync(new URL('runt-explorador.json', file), JSON.stringify({ periodo: { desde, hasta }, filas: [...explorer.values()] }));
  console.log({ leidas, validas, desde, hasta, grupos: Object.keys(groups).length, gruposExplorador: explorer.size });
}

let cached;
let modified;
export function consultarRunt({ marca, modelo, ano, ciudad }) {
  if (!fs.existsSync(file)) return null;
  const timestamp = fs.statSync(file).mtimeMs;
  if (!cached || timestamp !== modified) {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    modified = timestamp;
  }
  const counts = cached.groups[reference(marca, modelo, ano, ciudad)] ?? {};
  const meses = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, cantidad]) => ({ mes, cantidad }));
  return { periodo: cached.periodo, total: meses.reduce((sum, row) => sum + row.cantidad, 0), meses };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await importar(process.argv[2]);

