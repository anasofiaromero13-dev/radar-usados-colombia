import { calcularOferta } from '../oferta-usados.js';

const data = new Map();
const handlers = new Map();
const cache = new Map();
const nameOf = (url) => String(url).split('/').at(-1).replace('.json','');
let ready;
async function load() {
  ready ??= Promise.all(['vendetunave','facebook','mercado-libre','runt','runt-explorador','municipios','geo_dptos'].map(async (name) => {
    const response = await fetch(import.meta.env.BASE_URL + 'demo-data/' + name + '.json');
    if (!response.ok) throw new Error('No se pudo cargar el corte de ' + name);
    data.set(name, await response.text());
  })).then(() => {
    runtime.store.municipios = JSON.parse(data.get('municipios'));
  }).catch((error) => { ready = null; throw error; });
  return ready;
}
const key = (v) => String(v??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const family = (v) => String(v).toLowerCase().match(/\b(grand touring lx|grand touring|touring|txl)\b/)?.[1] ?? '';
const city = (v) => ({bogotadc:'bogota',santiagodecali:'cali'}[key(v)]??key(v));
function dataset(name) {
  if (!cache.has(name)) cache.set(name,JSON.parse(data.get(name)));
  return cache.get(name);
}

export const runtime = {
  app: { get(path,_auth,handler) { handlers.set(path.replace('/api',''),handler); } },
  requireUser: null, isAdmin: () => false,
  store: { municipios: [] },
  norm: (v) => String(v??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim(),
  fs: {
    existsSync: (url) => data.has(nameOf(url)),
    readFileSync: (url) => data.get(nameOf(url)),
  },
  coverageFor(name, summarize, variant='resumen') {
    if (!data.has(name)) return null;
    const id=name+':'+variant;
    if (!cache.has(id)) cache.set(id,summarize(dataset(name)));
    return cache.get(id);
  },
  consultarMercadoLibre(q) {
    const matches=dataset('mercado-libre').filter(r=>key(r.marca)===key(q.marca)&&key(r.modelo)===key(q.modelo)&&r.ano===q.ano&&
      Number(q.kilometraje)>=r.desde&&Number(q.kilometraje)<=r.hasta&&(key(r.version)===key(q.version)||key(family(r.version))===key(q.version)));
    return {total:matches.length,filas:matches.slice(0,12)};
  },
  consultarRunt(q) {
    const report=dataset('runt');
    const counts=report.groups[[key(q.marca),key(q.modelo),q.ano,city(q.ciudad)].join('|')]??{};
    const meses=Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)).map(([mes,cantidad])=>({mes,cantidad}));
    return {periodo:report.periodo,total:meses.reduce((s,r)=>s+r.cantidad,0),meses};
  },
};

const storageKey='radar-pages-tasaciones-v1';
function rows() {
  try { return JSON.parse(localStorage.getItem(storageKey)||'[]'); }
  catch { throw new Error('El navegador no pudo leer las tasaciones locales.'); }
}
export async function publicApi(path,{method='GET',body}={}) {
  if(path==='/config')return {appName:'Radar Usados Colombia',contact:{}};
  if(path==='/me'||path==='/login')return {user:{id:1,role:'demo',username:'demo'}};
  if(path==='/logout')return {ok:true};
  await load();
  if(path==='/geo/dptos')return dataset('geo_dptos');
  if(path.startsWith('/usados/tasaciones')) {
    const existing=rows();
    if(method==='GET')return existing.slice(0,200);
    if(method==='POST') {
      const offer=calcularOferta(body?.supuestos);
      if(!offer||!body?.query||!Number.isSafeInteger(Number(body.pedido))||Number(body.pedido)<=0||
        !Number.isSafeInteger(Number(body.ofertaFinal))||Number(body.ofertaFinal)<=0)throw new Error('Revisa los valores de la oferta.');
      const evidence=await publicApi('/usados/comparables?'+new URLSearchParams(body.query));
      const id=crypto.randomUUID();
      existing.unshift({id,created_at:new Date().toISOString(),estado:'En evaluación',query:body.query,
        pedido:Number(body.pedido),ofertaFinal:Number(body.ofertaFinal),offer,nota:String(body.nota??'').slice(0,1000),
        evidencia:{cortes:evidence.cortes,elegibles:evidence.elegibles,rango:evidence.rangoPublicado,anuncios:evidence.anuncios.slice(0,30)}});
      localStorage.setItem(storageKey,JSON.stringify(existing));
      return {id};
    }
    if(method==='PATCH') {
      if(!['En evaluación','Oferta enviada','Cerrada'].includes(body?.estado))throw new Error('Estado inválido');
      const row=existing.find(r=>r.id===path.split('/').at(-1));
      if(!row)throw new Error('Tasación no encontrada');
      row.estado=body.estado;localStorage.setItem(storageKey,JSON.stringify(existing));return {estado:row.estado};
    }
  }
  await import('./routes.js');
  const url=new URL(path,'https://demo.invalid');
  const handler=handlers.get(url.pathname);
  if(!handler)throw new Error('Consulta no disponible en esta demo.');
  let status=200,result;
  const res={status(value){status=value;return this;},json(value){result=value;return this;}};
  handler({query:Object.fromEntries(url.searchParams),user:{id:1,role:'demo'}},res);
  if(status>=400)throw new Error(result?.error||'No se pudo consultar la demo.');
  return result;
}
