import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'web/src/pages-demo');
const dataOut = path.join(root, 'web/public/demo-data');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(dataOut, { recursive: true });
const files = ['vendetunave','facebook','mercado-libre','runt','runt-explorador'];
for (const name of files) {
  const source = path.join(root, 'storage/radar-usados', name + '.json');
  if (!fs.existsSync(source)) throw new Error('Falta importar ' + name);
  fs.copyFileSync(source, path.join(dataOut, name + '.json'));
}
const municipalities = JSON.parse(fs.readFileSync(path.join(root,'data/built/municipios.json')));
fs.writeFileSync(path.join(dataOut,'municipios.json'),JSON.stringify(municipalities.map(({name,lat,lon})=>({name,lat,lon}))));
fs.copyFileSync(path.join(root,'data/built/geo_dptos.json'),path.join(dataOut,'geo_dptos.json'));
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');
fs.writeFileSync(path.join(out,'comparables.js'),read('server/usados.js').replace('../web/src/oferta-usados.js','../oferta-usados.js'));
const index=read('server/index.js');
const coverage=index.slice(index.indexOf("app.get('/api/usados/cobertura'"),index.indexOf('db.exec(`CREATE TABLE IF NOT EXISTS radar_tasaciones'));
const comparables=index.slice(index.indexOf("app.get('/api/usados/comparables'"),index.indexOf("app.get('/api/config'"));
if (!coverage.includes("'/api/usados/traspasos'") || !comparables.includes('buscarComparables')) throw new Error('Servidor inesperado.');
fs.writeFileSync(path.join(out,'routes.js'),`
import { buscarComparables } from './comparables.js';
import { runtime } from './runtime.js';
const { app, requireUser, coverageFor, isAdmin, store, fs, norm, consultarMercadoLibre, consultarRunt } = runtime;
${coverage}
${comparables}
`);
console.log('Datos públicos preparados. Demo Dealers y SQLite quedan fuera del sitio.');
fs.copyFileSync(path.join(root,'scripts/pages-runtime.js'),path.join(out,'runtime.js'));

