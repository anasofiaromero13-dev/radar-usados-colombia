
import { buscarComparables } from './comparables.js';
import { runtime } from './runtime.js';
const { app, requireUser, coverageFor, isAdmin, store, fs, norm, consultarMercadoLibre, consultarRunt } = runtime;
app.get('/api/usados/cobertura', requireUser, (req, res) => {
  const vendetunave = coverageFor('vendetunave', ({ anuncios }) => {
    const cities = new Map();
    for (const ad of anuncios) {
      const city = ad.ciudad?.trim().toLocaleUpperCase('es-CO');
      if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
    }
    return {
      anuncios: anuncios.length, ciudades: cities.size,
      cortes: [...new Set(anuncios.map((ad) => ad.fecha_scraping).filter(Boolean))].sort(),
      plazas: [...cities].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  });
  res.json({
    vendetunave,
    facebook: coverageFor('facebook', ({ resumen }) => ({
      filas: resumen.filas, candidatos: resumen.conDatosBasicos,
    })),
    mercadoLibre: coverageFor('mercado-libre', (rows) => ({ referencias: rows.length })),
    runt: coverageFor('runt', ({ groups, periodo }) => ({
      periodo, traspasos: Object.values(groups).reduce((total, months) =>
        total + Object.values(months).reduce((sum, count) => sum + count, 0), 0),
    })),
    ...(isAdmin(req) ? { dealers: coverageFor('dealers', (groups) => ({
      grupos: Object.keys(groups).length,
    })) } : {}),
  });
});

const mapCityKey = (value) => {
  const key = String(value ?? '').split(',')[0].normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({ bogotadc: 'bogota', santiagodecali: 'cali', cartagenadeindias: 'cartagena' })[key] ?? key;
};

function groupCoverage(groups, read, field, brand = '') {
  const cities = new Map();
  for (const [reference, months] of Object.entries(groups)) {
    if (brand && mapCityKey(reference.split('|')[0]) !== brand) continue;
    const city = mapCityKey(reference.split('|').at(-1));
    if (!city) continue;
    const values = cities.get(city) ?? {};
    values[field] = (values[field] ?? 0) + Object.values(months).reduce((sum, row) => sum + read(row), 0);
    cities.set(city, values);
  }
  return cities;
}

function listingCoverage({ anuncios }, field, eligible = () => true) {
  const cities = new Map();
  for (const listing of anuncios) {
    const city = mapCityKey(listing.ciudad);
    if (!city || !eligible(listing)) continue;
    const values = cities.get(city) ?? {};
    values[field] = (values[field] ?? 0) + 1;
    cities.set(city, values);
  }
  return cities;
}

app.get('/api/usados/mapa-nacional', requireUser, (req, res) => {
  const brand = typeof req.query.marca === 'string' ? mapCityKey(req.query.marca) : '';
  const raw = (name) => coverageFor(name, (data) => data, 'raw-dashboard');
  const vtn = raw('vendetunave');
  const facebook = raw('facebook');
  const runt = raw('runt');
  const dealers = isAdmin(req) ? raw('dealers') : null;
  const matchesBrand = (ad) => !brand || mapCityKey(ad.marca) === brand;
  const feeds = [
    vtn && listingCoverage(vtn, 'anuncios', matchesBrand),
    facebook && listingCoverage(facebook, 'facebook', (ad) => matchesBrand(ad) && ad.datosBasicos && !ad.posibleDuplicadoVendeTuNave),
    runt && groupCoverage(runt.groups, (row) => row, 'traspasos', brand),
    dealers && groupCoverage(dealers, (row) => row.visitas, 'visitas', brand),
    dealers && groupCoverage(dealers, (row) => row.publicaciones, 'publicaciones', brand),
  ];

  const coordinates = new Map();
  for (const municipality of store.municipios) {
    const city = mapCityKey(municipality.name);
    if (coordinates.has(city)) coordinates.set(city, null);
    else if (Number.isFinite(municipality.lon) && Number.isFinite(municipality.lat)) coordinates.set(city, municipality);
  }
  const cities = new Map();
  for (const feed of feeds) {
    for (const [city, values] of feed ?? []) {
      cities.set(city, { ...cities.get(city), ...values });
    }
  }

  const plazas = [];
  for (const [city, metrics] of cities) {
    const place = coordinates.get(city);
    if (place) plazas.push({ ciudad: place.name, coordenadas: [place.lon, place.lat], ...metrics });
  }
  res.json({ plazas, sinUbicar: cities.size - plazas.length });
});

app.get('/api/usados/traspasos', requireUser, (req, res) => {
  const report = coverageFor('runt-explorador', (data) => data);
  if (!report) return res.status(503).json({ error: 'Ejecuta el importador actualizado de RUNT.' });
  const fields = ['mes', 'departamento', 'ciudad', 'marca', 'modelo', 'ano', 'clase', 'combustible'];
  const filters = fields.map((field) => typeof req.query[field] === 'string' ? req.query[field].trim() : '');
  const normalized = (value, index) => index === 2 ? mapCityKey(value) : norm(value).replace(/[^a-z0-9]/g, '');
  const selected = filters.map(normalized);
  const options = fields.map(() => new Set());
  const references = new Map();
  const brands = new Map();
  const classes = new Map();
  const months = new Map();
  const cities = new Map();
  let total = 0;
  for (const row of report.filas) {
    const mismatches = selected.flatMap((value, index) => value && value !== normalized(row[index], index) ? [index] : []);
    if (mismatches.length === 0) {
      for (let index = 0; index < fields.length; index++) if (row[index]) options[index].add(row[index]);
      const [mes, departamento, ciudad, marca, modelo, ano, , , count] = row;
      total += count;
      brands.set(marca, (brands.get(marca) ?? 0) + count);
      const clase = row[6] || 'Sin clasificar';
      classes.set(clase, (classes.get(clase) ?? 0) + count);
      months.set(mes, (months.get(mes) ?? 0) + count);
      const id = [marca, modelo, ano].map((value) => normalized(value, 0)).join('|');
      const ref = references.get(id) ?? { marca, modelo, ano, cantidad: 0, plazas: new Map() };
      ref.cantidad += count;
      ref.plazas.set(ciudad, (ref.plazas.get(ciudad) ?? 0) + count);
      references.set(id, ref);
    } else if (mismatches.length === 1 && row[mismatches[0]]) {
      options[mismatches[0]].add(row[mismatches[0]]);
    }
    if (mismatches.every((index) => index === 1 || index === 2)) {
      const city = row[2] + (row[1] ? ' · ' + row[1] : '');
      cities.set(city, (cities.get(city) ?? 0) + row[8]);
    }
  }

  const ranked = (map) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  res.json({
    periodo: report.periodo, total,
    opciones: Object.fromEntries(fields.map((field, index) => [field, [...options[index]].sort((a, b) => a.localeCompare(b, 'es'))])),
    meses: [...months].sort(([a], [b]) => a.localeCompare(b)),
    plazas: ranked(cities).slice(0, 12),
    marcas: ranked(brands).slice(0, 8),
    clases: ranked(classes).slice(0, 8),
    referencias: [...references.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 25)
      .map(({ plazas, ...ref }) => ({ ...ref, ciudad: ranked(plazas)[0]?.[0] })),
  });
});


app.get('/api/usados/comparables', requireUser, (req, res) => {
  const { marca, modelo, ano, ciudad, version, kilometraje } = req.query;
  const validText = (value) => typeof value === 'string' && value.trim().length > 0;

  if (![marca, modelo, ano, ciudad].every(validText)) {
    return res.status(400).json({ error: 'Indica marca, línea, año y ciudad.' });
  }

  if (version !== undefined || kilometraje !== undefined) {
    if (!validText(version) || typeof kilometraje !== 'string' ||
        !/^\d{1,7}$/.test(kilometraje)) {
      return res.status(400).json({
        error: 'Para buscar comparables, indica versión y kilometraje en kilómetros.',
      });
    }
  }

  const file = new URL('../storage/radar-usados/vendetunave.json', import.meta.url);
  if (!fs.existsSync(file)) {
    return res.status(503).json({ error: 'Ejecuta primero el importador de VendeTuNave.' });
  }

  const { anuncios } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = buscarComparables(anuncios, { marca, modelo, ano, ciudad, version, kilometraje });
  const cityKey = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  const municipalities = new Map();
  for (const item of store.municipios) {
    const key = cityKey(item.name);
    const entries = municipalities.get(key) ?? [];
    entries.push(item);
    municipalities.set(key, entries);
  }
  const aliases = { cali: 'santiagodecali', bogota: 'bogotadc' };
  const plazas = result.plazas.map((plaza) => {
    const key = cityKey(plaza.ciudad);
    const matches = municipalities.get(key) ?? municipalities.get(aliases[key]) ?? [];
    const item = matches.length === 1 ? matches[0] : null;
    const coordenadas = item && Number.isFinite(item.lon) && Number.isFinite(item.lat)
      ? [item.lon, item.lat] : null;
    return { ...plaza, coordenadas };
  });
  const facebookFile = new URL('../storage/radar-usados/facebook.json', import.meta.url);
  let facebook = null;
  if (result.bandaKm && fs.existsSync(facebookFile)) {
    const { archivo, anuncios: listings } = JSON.parse(fs.readFileSync(facebookFile, 'utf8'));
    const matches = listings.filter((ad) =>
      ad.datosBasicos && !ad.posibleDuplicadoVendeTuNave &&
      cityKey(ad.marca) === cityKey(marca) && cityKey(ad.modelo) === cityKey(modelo) &&
      ad.ano === ano.trim() && cityKey(ad.ciudad.split(',')[0]) === cityKey(ciudad.split(',')[0]) &&
      cityKey(ad.version) === cityKey(version) &&
      Number(ad.kilometraje) >= result.bandaKm.desde &&
      Number(ad.kilometraje) <= result.bandaKm.hasta
    );
    facebook = {
      archivo, total: matches.length,
      anuncios: matches.slice(0, 30).map(({ url, precio, kilometraje, transmision }) =>
        ({ url, precio, kilometraje, transmision })),
    };
  }
  return res.json({ ...result, plazas, facebook, mercadoLibre: consultarMercadoLibre(req.query), runt: consultarRunt(req.query), ...(isAdmin(req) ? { dealers: consultarDealers(req.query) } : {}) });
});


