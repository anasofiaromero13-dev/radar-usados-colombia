import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

const file = new URL('../../storage/radar-usados/dealers.json', import.meta.url);
const key = (v) => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const cityKey = (v) => ({ bogotadc: 'bogota', santiagodecali: 'cali' }[key(v)] ?? key(v));
const reference = (marca, modelo, ano, ciudad) => [key(marca), key(modelo), String(ano).trim(), cityKey(ciudad)].join('|');

async function importar(source) {
  if (!source) throw new Error('Indica la ruta del Excel Demo Dealers.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(source);
  const sheet = workbook.getWorksheet('Base de datos');
  if (!sheet) throw new Error('No se encontró la hoja Base de datos.');
  const headers = ['Mes', 'Condicion', 'Departamento', 'Ciudad', 'Marca', 'Marca modelo', 'Año', 'Publicaciones', 'Visitas'];
  const columns = headers.map((name) => sheet.getRow(1).values.findIndex((value) => key(value) === key(name)));
  if (columns.some((column) => column < 1)) throw new Error('Faltan columnas de Demo Dealers.');

  const groups = {};
  let validas = 0;
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const [date, condition, department, city, brand, brandModel, year, listings, visits] =
      columns.map((column) => row.getCell(column).value);
    if (key(condition) !== 'usado' || !(date instanceof Date) || !Number.isFinite(date.getTime())) return;
    if (!key(brand) || !key(city) || !/^\d{4}$/.test(String(year))) return;
    if (!Number.isFinite(listings) || listings <= 0 || !Number.isSafeInteger(visits) || visits < 0) return;

    const model = key(brandModel);
    const brandKey = key(brand);
    const line = model.startsWith(brandKey) ? model.slice(brandKey.length) : model;
    if (!line) return;
    const cityName = cityKey(department) === 'bogota' ? 'Bogotá' : city;
    const id = reference(brand, line, year, cityName);
    const month = date.toISOString().slice(0, 7);
    const periods = groups[id] ??= {};
    const totals = periods[month] ??= { publicaciones: 0, visitas: 0 };
    totals.publicaciones += listings;
    totals.visitas += visits;
    validas++;
  });

  if (!validas) throw new Error('No se encontraron filas válidas de vehículos usados.');
  fs.mkdirSync(new URL('.', file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(groups));
  console.log({ filasValidas: validas, grupos: Object.keys(groups).length });
}

let cache;
let modified;
export function consultarDealers({ marca, modelo, ano, ciudad }) {
  if (!fs.existsSync(file)) return null;
  const timestamp = fs.statSync(file).mtimeMs;
  if (!cache || timestamp !== modified) {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'));
    modified = timestamp;
  }
  const periods = cache[reference(marca, modelo, ano, ciudad)] ?? {};
  return Object.entries(periods).sort(([a], [b]) => a.localeCompare(b)).map(([mes, totals]) => ({
    mes, ...totals, visitasPorPublicacion: totals.visitas / totals.publicaciones,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await importar(process.argv[2]);
