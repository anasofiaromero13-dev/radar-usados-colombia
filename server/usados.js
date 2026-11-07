import { calcularOferta } from '../web/src/oferta-usados.js';

const normalize = (value) => String(value ?? '').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const key = (value) => normalize(value).replaceAll(' ', '');

function version(title) {
  const text = normalize(title);
  if (/\bgrand touring lx\b/.test(text)) return 'grand touring lx';
  if (/\bgrand touring\b/.test(text)) return 'grand touring';
  if (/\btouring\b/.test(text)) return 'touring';
  return '';
}

function percentile(prices, fraction) {
  const index = (prices.length - 1) * fraction;
  const lower = Math.floor(index);
  return Math.round(prices[lower] + (prices[Math.ceil(index)] - prices[lower]) * (index - lower));
}

function evaluarPlaza(anuncios, query) {
  const { marca, modelo, ano, ciudad, kilometraje } = query;
  const requestedVersion = normalize(query.version);
  const strict = Boolean(requestedVersion);
  const km = Number(kilometraje);
  const lower = Math.max(0, km - 20000);
  const upper = km + 20000;
  const origin = anuncios.filter((ad) =>
    key(ad.marca) === key(marca) && key(ad.modelo) === key(modelo) &&
    ad.ano === ano.trim() && key(ad.ciudad) === key(ciudad)
  );

  const excluded = {};
  const seen = new Set();
  const configurations = new Map();
  const matches = [];
  for (const ad of origin) {
    const price = Number(ad.precio);
    const distance = Number(ad.kilometraje);
    let reason;
    if (strict) {
      const rawCc = ad.cilindraje_cc;
      // En esta línea el corte mezcla la abreviatura en litros con centímetros cúbicos.
      const mazdaCx30 = key(ad.marca) === 'mazda' && key(ad.modelo) === 'cx30';
      const cc = mazdaCx30 ? ({ '20': '2000', '25': '2500' }[rawCc] ?? rawCc) : rawCc;
      const signature = [price, distance, key(ad.combustible), key(ad.transmision), key(cc)].join('|');
      if (version(ad.title) !== requestedVersion) reason = 'Versión distinta o sin identificar';
      else if (key(ad.condicion) !== 'usado' || ad.blindado !== '0') reason = 'Condición o blindaje incompatible';
      else if (!/^\d+$/.test(ad.kilometraje) || distance < lower || distance > upper) reason = 'Kilometraje fuera de banda o inválido';
      else if (!Number.isSafeInteger(price) || price <= 0 || /\b(cuota|anticipo|inicial)\b/.test(normalize(ad.title))) reason = 'Precio dudoso';
      else if (seen.has(signature)) reason = 'Posible duplicado';
      if (reason) {
        excluded[reason] = (excluded[reason] ?? 0) + 1;
        continue;
      }
      seen.add(signature);
      const attributes = [ad.combustible, ad.transmision, cc];
      const configKey = attributes.map(key).join('|');
      if (!configurations.has(configKey)) {
        configurations.set(configKey, {
          combustible: ad.combustible,
          transmision: ad.transmision,
          cilindrajeCc: cc,
          precios: [],
        });
      }
      configurations.get(configKey).precios.push(price);
    }
    matches.push({
      titulo: ad.title, precioPublicado: ad.precio, kilometraje: ad.kilometraje,
      ciudad: ad.ciudad, url: ad.url_publicacion,
    });
  }

  const grupos = Array.from(configurations.values(), ({ precios, ...config }) => {
    precios.sort((a, b) => a - b);
    const complete = Object.values(config).every((value) => key(value));
    const rangoPublicado = complete && precios.length >= 10
      ? { p25: percentile(precios, 0.25), mediana: percentile(precios, 0.5), p75: percentile(precios, 0.75) }
      : null;
    const ofertaSimulada = rangoPublicado && calcularOferta({
      reventa: rangoPublicado.p25,
      alistamiento: 2000000,
      otrosCostos: 1000000,
      margenPorcentaje: 10,
    });
    return { ...config, candidatos: precios.length, rangoPublicado, ofertaSimulada };
  }).sort((a, b) => b.candidatos - a.candidatos);

  return {
    fuente: 'VendeTuNave',
    totalOrigen: origin.length,
    cortes: [...new Set(origin.map((ad) => ad.fecha_scraping))],
    elegibles: strict ? matches.length : null,
    bandaKm: strict ? { desde: lower, hasta: upper } : null,
    configuraciones: strict ? configurations.size : null,
    exclusiones: excluded,
    grupos,
    rangoPublicado: grupos.length === 1 ? grupos[0].rangoPublicado : null,
    anuncios: matches,
  };
}


export function buscarComparables(anuncios, query) {
  const cities = new Map();
  for (const ad of anuncios) {
    if (key(ad.marca) !== key(query.marca) || key(ad.modelo) !== key(query.modelo) ||
        ad.ano !== query.ano.trim() || !key(ad.ciudad)) continue;
    const city = key(ad.ciudad);
    if (!cities.has(city)) cities.set(city, []);
    cities.get(city).push(ad);
  }

  const selected = evaluarPlaza(cities.get(key(query.ciudad)) ?? [], query);
  const plazas = [];
  if (normalize(query.version)) {
    for (const [city, listings] of cities) {
      const ciudad = listings[0].ciudad;
      const result = city === key(query.ciudad)
        ? selected : evaluarPlaza(listings, { ...query, ciudad });
      if (result.elegibles > 0) {
        plazas.push({
          ciudad, candidatos: result.elegibles, cortes: result.cortes,
          mediana: result.rangoPublicado?.mediana ?? null,
          seleccionada: city === key(query.ciudad),
        });
      }
    }
  }

  plazas.sort((a, b) => b.candidatos - a.candidatos || a.ciudad.localeCompare(b.ciudad, 'es'));
  return { ...selected, plazas };
}
