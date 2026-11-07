import DemoAssistant from '../components/DemoAssistant.jsx';
import maplibregl from 'maplibre-gl';
import { calcularOferta } from '../oferta-usados.js';
import React, { useEffect, useRef, useState } from 'react';
import { api, cop, fmt, qs } from '../api.js';

const emptyPlazas = [];

const initialFilters = {
  marca: 'Mazda',
  modelo: 'CX-30',
  ano: '2022',
  ciudad: 'Medellín',
  version: 'Touring',
  kilometraje: '55000',
};

const fields = [
  ['marca', 'Marca'],
  ['modelo', 'Línea'],
  ['ano', 'Año'],
  ['ciudad', 'Ciudad'],
  ['version', 'Versión'],
  ['kilometraje', 'Kilometraje (km)'],
];

export default function Usados({ view, navigate }) {
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transferContext, setTransferContext] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const requestVersion = useRef(0);
  function resetAll() {
    requestVersion.current++; setLoading(false);
    setFilters(initialFilters); setSearch(null); setTransferContext(null); setEditing(false); setError('');
    setResetKey((value) => value + 1); navigate('dashboard');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await runSearch(filters);
  }

  async function runSearch(nextFilters) {
    const version = ++requestVersion.current;

    const query = Object.fromEntries(
      fields.map(([key]) => [key, nextFilters[key].trim()])
    );

    setSearch(null);
    setError('');

    if (Object.values(query).some((value) => !value)) {
      setError('Completa los filtros para buscar.');
      return;
    }

    setLoading(true);
    try {
      const result = await api(`/usados/comparables${qs(query)}`);
      if (version !== requestVersion.current) return;
      setSearch({ query, result });
      setTransferContext(query);
      setEditing(false);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return (
    <section className="radar-workspace">
      <DemoAssistant context={search?.query ?? filters} result={search?.result}
        navigate={navigate} onSearch={(query) => {
          setFilters(query); navigate('tasar'); void runSearch(query);
        }} onTransfers={(query) => { setTransferContext(query); navigate('traspasos'); }} />
      <header className="radar-heading">
        <small>Inteligencia de compra · Colombia</small>
        <h1>{{ dashboard: 'Dashboard', compras: 'Mesa de compras', inicio: 'Explorar plazas', traspasos: 'Traspasos', tasar: 'Tasar vehículo' }[view]}</h1>
        <p>{{ dashboard: 'Revisa la cobertura disponible y elige por dónde empezar.', compras: 'Revisa las ofertas guardadas y la evidencia que las sustenta.', inicio: 'Encuentra dónde hay evidencia para el vehículo que estás evaluando.', traspasos: 'Identifica qué referencias registraron actividad y compara plazas con el mismo corte de RUNT.', tasar: 'Define cuánto puedes pagar y revisa la evidencia que sustenta el escenario.' }[view]}</p>
      </header>
      <div className="radar-reset"><button type="button" className="btn sm" onClick={resetAll}>Restablecer filtros</button></div>
      {view === 'compras' && <PurchaseDesk onNew={() => { setSearch(null); setEditing(true); navigate('tasar'); }} />}
      {view === 'dashboard' && <Dashboard key={resetKey} onReset={resetAll} search={search} navigate={navigate} onInvestigate={(query) => { setTransferContext(typeof query === 'string' ? { ciudad: query } : query); navigate('traspasos'); }} />}
            <div hidden={view !== 'traspasos'}>
        <Transfers key={resetKey} active={view === 'traspasos'} context={transferContext} onAppraise={(ref) => {
          setFilters({ marca: ref.marca, modelo: ref.modelo, ano: ref.ano, ciudad: ref.ciudad ?? '', version: '', kilometraje: '' });
          setSearch(null);
          setError('');
          setEditing(true);
          navigate('tasar');
        }} />
      </div>
      {['inicio', 'tasar'].includes(view) && (
        <div className="radar-filter">
          {search && !editing && (
            <div className="radar-context">
              <div><small>Filtro aplicado en todas las vistas</small><strong>{Object.values(search.query).join(' · ')} km</strong></div>
              <button type="button" className="btn sm" onClick={() => setEditing(true)}>Cambiar filtros</button>
            </div>
          )}
          {(!search || editing) && (
      <form onSubmit={handleSubmit}>
        <fieldset
          disabled={loading}
          className="radar-fields"
        >
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input className="input"
                required
                inputMode={['ano', 'kilometraje'].includes(key) ? 'numeric' : 'text'}
                pattern={key === 'ano' ? '[0-9]{4}' : key === 'kilometraje' ? '[0-9]{1,7}' : undefined}
                value={filters[key]}
                style={{ display: 'block' }}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilters((current) => ({ ...current, [key]: value }));
                }}
              />
            </label>
          ))}
          <button className="btn primary" type="submit">
            {loading ? 'Buscando…' : 'Buscar anuncios'}
          </button>
        </fieldset>
      </form>
          )}
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      {!search && view === 'inicio' && <PlazaMap plazas={emptyPlazas} />}
      {search && ['inicio', 'tasar'].includes(view) && (
        <Results query={search.query} result={search.result} view={view} navigate={navigate} onCity={(ciudad) => {
          const next = { ...search.query, ciudad };
          setFilters(next);
          if (view === 'inicio') navigate('tasar');
          void runSearch(next);
        }} />
      )}
    </section>
  );
}

function Results({ query, result, onCity, view, navigate }) {
  return (
    <section className="card" style={{ marginTop: 20 }} aria-live="polite">
      <h2>{query.marca} {query.modelo} {query.ano} · {query.ciudad}</h2>
      <p><strong>{result.totalOrigen} anuncios de origen</strong></p>
      <p>
        {result.fuente} · Corte de captura{' '}
        {result.cortes.join(', ') || 'sin dato'}
      </p>
      <p>Datos históricos. La disponibilidad del anuncio puede haber cambiado.</p>
      {view === 'tasar' && <>
      <VehicleDiagram query={query} count={result.elegibles} />
      {result.bandaKm && (
        <>
          <p><strong>{result.elegibles} candidatos</strong> · {query.version} · {fmt(result.bandaKm.desde)}–{fmt(result.bandaKm.hasta)} km</p>
          {result.rangoPublicado ? (
            <PriceBand range={result.rangoPublicado} />
          ) : (
            <p>{result.configuraciones > 1
              ? 'Rango pendiente: los candidatos tienen configuraciones distintas.'
              : 'Muestra insuficiente para estimar un rango.'}</p>
          )}
          {(result.grupos ?? []).filter((group) => group.ofertaSimulada).map((group) => (
            <Offer key={JSON.stringify([group.combustible, group.transmision, group.cilindrajeCc])} group={group} query={query} onSaved={() => navigate('compras')} />
          ))}
          {Object.keys(result.exclusiones).length > 0 && (
            <details>
              <summary>Ver exclusiones</summary>
              <ul>{Object.entries(result.exclusiones).map(([reason, count]) => (
                <li key={reason}>{reason}: {count}</li>
              ))}</ul>
            </details>
          )}
        </>
      )}

        <div className="row" style={{ marginBlock: 12 }}>
          <button className="btn" onClick={() => navigate('inicio')}>Comparar plazas</button>
          <button className="btn" onClick={() => navigate('traspasos')}>Ver actividad histórica</button>
        </div>
        <h3>Evidencia de precios publicados</h3>
      {result.anuncios.length === 0 ? (
        <p>Prueba con otra ciudad o revisa la línea y el año.</p>
      ) : (
        <div className="radar-table-wrap">
          <table className="radar-table radar-comparables">
            <thead><tr><th>Anuncio · VendeTuNave</th><th>Precio publicado</th><th>Kilometraje</th></tr></thead>
            <tbody>{[...result.anuncios].sort((a, b) => Math.abs(a.kilometraje - query.kilometraje) - Math.abs(b.kilometraje - query.kilometraje)).map((ad) => (
              <tr key={ad.url}>
                <td><a href={ad.url} target="_blank" rel="noopener noreferrer">{ad.titulo}</a></td>
                <td>{ad.precioPublicado ? cop(ad.precioPublicado) : 'Sin dato'}</td>
                <td>{ad.kilometraje ? fmt(ad.kilometraje) + ' km' : 'Sin dato'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <SourceComparison mercado={result.mercadoLibre} facebook={result.facebook} />
      </>}
      {view === 'tasar' && <>
      <details className="card" style={{ marginBlock: 16 }}><summary>Ver actividad histórica de la plaza</summary>
      {result.dealers && (
        <section className="card" style={{ marginBlock: 16 }}>
          <h3>Demo Dealers · Interés histórico en Mercado Libre</h3>
          <p>Vista interna. Vehículos usados por línea, año y ciudad, con todas las versiones y kilometrajes. Las visitas reflejan actividad en el portal.</p>
          {result.dealers.length === 0 ? <p>Sin datos para esta referencia y plaza.</p> : (
            <ul>{result.dealers.map((row) => (
              <li key={row.mes}>
                {row.mes} · Publicaciones según el informe: {fmt(row.publicaciones, 1)}
                {' · '}{fmt(row.visitas)} visitas · {fmt(row.visitasPorPublicacion, 1)} visitas por publicación
              </li>
            ))}</ul>
          )}
          <p>La métrica de publicaciones del archivo admite decimales. Estos datos quedan separados de la oferta.</p>
        </section>
      )}
      {result.runt && (
        <section className="card" style={{ marginBlock: 16 }}>
          <h3>RUNT · Traspasos históricos</h3>
          <p><strong>{fmt(result.runt.total)} traspasos registrados en el archivo</strong></p>
          <p>{query.marca} {query.modelo} {query.ano} · {query.ciudad} · Período {result.runt.periodo.desde} a {result.runt.periodo.hasta}</p>
          <p>Conteo por línea, año del vehículo y ciudad del traspaso. Incluye todas las versiones. El archivo carece de precios de cierre.</p>
          {result.runt.meses.length > 0 ? (
            <MonthColumns rows={result.runt.meses.map(({ mes, cantidad }) => [mes, cantidad])} label="Traspasos por mes" />
          ) : <p>Sin coincidencias para esta referencia y ciudad en el archivo.</p>}
        </section>
      )}
</details>
      </>}
      {view !== 'tasar' && <>
      {result.bandaKm && (
        <section aria-label="Comparar plazas">
          <h3>Comparar plazas</h3>
          <p>Busca primero la plaza con suficiente evidencia. El conteo indica cobertura del archivo histórico.</p>
          {view === 'inicio' && <PlazaMap plazas={result.plazas ?? emptyPlazas} onCity={onCity} />}
          {(result.plazas ?? []).length === 0 ? <p>Sin candidatos en otras plazas para esta búsqueda.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="radar-table">
                <thead><tr><th>Plaza</th><th>Candidatos</th><th>Mediana publicada</th><th>Corte</th><th>Ficha</th></tr></thead>
                <tbody>
                  {result.plazas.map((plaza) => (
                    <tr key={plaza.ciudad}>
                      <td>{plaza.ciudad}</td>
                      <td>{plaza.candidatos}</td>
                      <td>{plaza.mediana == null ? 'Sin rango' : cop(plaza.mediana)}</td>
                      <td>{plaza.cortes.join(', ')}</td>
                      <td>{plaza.seleccionada && view !== 'inicio' ? 'Actual' : (
                        <button type="button" className="btn sm" onClick={() => onCity(plaza.ciudad)}>
                          Ver {plaza.ciudad}
                        </button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      </>}
   </section>
  );
}
const offerFields = [
  ['reventa', 'Reventa esperada (COP)', 1],
  ['alistamiento', 'Alistamiento (COP)', 0],
  ['otrosCostos', 'Otros costos (COP)', 0],
  ['margenPorcentaje', 'Margen sobre la reventa (%)', 0],
];

function Offer({ group, query, onSaved }) {
  const initial = group.ofertaSimulada;
  const [values, setValues] = useState(initial);
  const offer = calcularOferta(values);
  const valid = offer !== null;
  const margin = offer?.margen;
  const available = offer?.saldo;

  return (
    <section className="card" style={{ marginBlock: 16 }}>
      <h3>Máximo de compra simulado</h3>
      <p aria-live="polite">
        <strong>{valid ? `${cop(offer.maximo)} COP` : 'Completa los supuestos con valores válidos.'}</strong>
      </p>
      <p>{group.combustible} · {group.transmision} · {fmt(group.cilindrajeCc)} cc · {group.candidatos} comparables</p>
      <p>Escenario ilustrativo. La reventa inicial usa el P25 de los precios publicados históricos ({cop(initial.reventa)}).</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {offerFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input className="input" inputMode="numeric" value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      {valid && <p>Margen en pesos: {cop(margin)}</p>}
      {valid && available < 0 && <p>Los costos y el margen superan la reventa esperada.</p>}
      <button type="button" className="btn" onClick={() => setValues(initial)}>
        Restablecer escenario
      </button>
      {offer && <SavePurchase query={query} offer={offer} onSaved={onSaved} />}
    </section>
  );
}



function PlazaMap({ plazas, onCity, onInspect, onSelect, national = false }) {
  const container = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const points = plazas.filter((plaza) => Array.isArray(plaza.coordenadas));
    if (!container.current) return;

    let map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: { version: 8, sources: {}, layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#eef4fc' } },
        ] },
        maxBounds: [[-83, -6], [-64, 15]],
        renderWorldCopies: false,
        center: [-74, 5],
        zoom: 4,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      const bounds = new maplibregl.LngLatBounds();

      for (const plaza of national ? [] : points) {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = plaza.seleccionada ? 'btn primary sm' : 'btn sm';
        marker.textContent = national ? '' : String(plaza.candidatos);
        if (national) {
          marker.className = 'radar-dot';
          marker.style.setProperty('--dot-size', Math.min(25, 9 + Math.log2(1 + (plaza.traspasos ?? 0))) + 'px');
        }
        marker.title = plaza.ciudad;
        marker.setAttribute('aria-label', national ? 'Ver cobertura de ' + plaza.ciudad : plaza.ciudad + ': ' + plaza.candidatos + ' candidatos');
        if (national) {
          for (const event of ['pointerenter', 'focus', 'click']) {
            marker.addEventListener(event, () => onInspect(plaza));
          }
        } else {
          marker.addEventListener('click', () => onCity(plaza.ciudad));
        }
        new maplibregl.Marker({ element: marker }).setLngLat(plaza.coordenadas).addTo(map);
        bounds.extend(plaza.coordenadas);
      }
      let cancelled = false;
      map.once('load', () => {
        api('/geo/dptos').then((geo) => {
          if (cancelled) return;
          if (!geo.features?.length) throw new Error('Sin geografía');
          map.addSource('colombia', { type: 'geojson', data: geo });
          map.addLayer({ id: 'territorio', type: 'fill', source: 'colombia', paint: { 'fill-color': '#cbdcf5' } });
          map.addLayer({ id: 'limites', type: 'line', source: 'colombia', paint: { 'line-color': '#7c98be', 'line-width': 1 } });
          if (national && points.length) {
            const maxCount = Math.max(1, ...points.map((point) => point.traspasos ?? 0));
            map.addSource('traspasos', { type: 'geojson', data: {
              type: 'FeatureCollection', features: points.map((point, index) => ({
                type: 'Feature', geometry: { type: 'Point', coordinates: point.coordenadas },
                properties: { index, cantidad: point.traspasos ?? 0 },
              })),
            } });
            map.addLayer({ id: 'calor', type: 'heatmap', source: 'traspasos', paint: {
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'cantidad'], 0, 0, maxCount, 1],
              'heatmap-intensity': 2.5,
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 20, 7, 55],
              'heatmap-opacity': .85,
              'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)', .15, '#b8d8f3', .35, '#55b9ce', .55, '#3d8d9f', .75, '#f5b65d', 1, '#cf463c'],
            } });
            map.addLayer({ id: 'seleccion-plaza', type: 'circle', source: 'traspasos', paint: {
              'circle-radius': 12, 'circle-opacity': 0,
            } });
            const inspect = (event) => {
              const feature = map.queryRenderedFeatures(event.point, { layers: ['seleccion-plaza'] })[0];
              map.getCanvas().style.cursor = feature ? 'pointer' : '';
              if (feature) onInspect(points[Number(feature.properties.index)]);
            };
            map.on('mousemove', inspect);
            map.on('click', (event) => {
              const feature = map.queryRenderedFeatures(event.point, { layers: ['seleccion-plaza'] })[0];
              if (feature && onSelect) onSelect(points[Number(feature.properties.index)]);
              else inspect(event);
            });
          }
        }).catch(() => { if (!cancelled) setFailed(true); });
      });
      map.fitBounds(points.length && !national ? bounds : [[-82, -4.5], [-66, 13.6]], { padding: 35, maxZoom: 8, duration: 0 });
      return () => { cancelled = true; map.remove(); };
    } catch {
      map?.remove();
      setFailed(true);
      return;
    }

  }, [plazas, onCity, onInspect, onSelect, national]);


  return (
    <div style={{ marginBlock: 12 }}>
      {failed ? <p>Mapa no disponible. Puedes abrir las plazas desde la tabla.</p> : (
        <>
          {!national && plazas.length > 0 && <p>Selecciona un marcador para abrir la plaza. El número indica cuántos candidatos hay.</p>}
          <div ref={container} aria-label="Mapa de cobertura por plaza" style={{ height: national ? 510 : 320, borderRadius: 8 }} />
        </>
      )}
    </div>
  );
}






function Dashboard({ search, navigate, onInvestigate }) {
  const [selection, setSelection] = useState({});
  const [report, setReport] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [hoverPlace, setHoverPlace] = useState(null);
  const [error, setError] = useState('');
  const city = selection.ciudad ?? '';
  const brand = selection.marca ?? '';

  useEffect(() => {
    let active = true;
    setError('');
    setReport(null);
    api('/usados/traspasos' + qs(selection)).then((data) => { if (active) setReport(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [city, brand, selection.clase]);

  useEffect(() => {
    let active = true;
    setMapData(null);
    setHoverPlace(null);
    api('/usados/mapa-nacional' + qs({ marca: brand })).then((data) => { if (active) setMapData(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [brand]);

  const selectCity = React.useCallback((place) => {
    setSelection((current) => ({ ...current, ciudad: place.ciudad }));
    setHoverPlace(place);
  }, []);
  const selectBrand = (marca) => setSelection((current) => ({ ...current, marca }));
  const selectedPlace = mapData?.plazas.find((place) => place.ciudad === city);
  const locations = city ? (selectedPlace ? [selectedPlace] : []) : (mapData?.plazas ?? []);
  const sum = (field) => {
    const present = locations.filter((place) => place[field] != null);
    return present.length ? present.reduce((total, place) => total + place[field], 0) : null;
  };
  const scope = [city || 'Colombia', brand || 'Todas las marcas'].join(' · ');

  return <>
    <section className="radar-dashboard-selection">
      <div><small>ANÁLISIS INTERACTIVO</small><h2>{scope}</h2>
        <p>Pulsa una plaza en el mapa, una marca o una clase para explorar los datos.</p></div>
      <div className="radar-filter-chips">
        {Object.entries(selection).map(([field,value]) => value && <button key={field} type="button" onClick={() => setSelection((current) => { const next = { ...current }; delete next[field]; return next; })}>{value} ×</button>)}
        {Object.keys(selection).length > 0 && <button type="button" onClick={() => setSelection({})}>Ver todo Colombia</button>}
      </div>
    </section>
    {error && <p role="alert">{error}</p>}
    {!report && !error && <p role="status">Actualizando análisis…</p>}
    {report && <>
      <div className="radar-kpis">
        <Metric label="Traspasos en la selección" value={report.total} note={'RUNT · ' + report.periodo.desde + ' a ' + report.periodo.hasta} />
        <Metric label="Anuncios de origen" value={sum('anuncios')} note={mapData ? 'VendeTuNave · Cobertura geográfica enlazada' : 'Actualizando…'} />
        <Metric label="Posibles comparables" value={sum('facebook')} note="Facebook · Filtro inicial" />
        <Metric label="Visitas históricas del portal" value={sum('visitas')} note="Demo Dealers · Vista interna cuando existe cobertura" />
      </div>
      <div className="radar-chart-grid radar-chart-grid--dashboard">
        <Bars rows={report.marcas} label="Marcas · Pulsa para filtrar" onSelect={selectBrand} />
        <ClassShare rows={report.clases} total={report.total} onSelect={(clase) => setSelection((current) => ({ ...current, clase }))} />
        <MonthlyTrend rows={report.meses} />
      </div>
      <ActivityInsights report={report} />
      <section className="card radar-national">
        <h2>¿Dónde se concentra la actividad?</h2>
        <p>{brand || 'Todas las marcas'} · Mapa comparativo de RUNT para Colombia. Al seleccionar una ciudad, los gráficos muestran esa plaza. El mapa conserva el contexto nacional de la marca.</p>
        {!mapData ? <p role="status">Actualizando mapa…</p> : <>
          <div className="radar-heat-legend"><span>Menor concentración</span><i /><span>Mayor concentración</span></div>
          <div className="radar-national-grid">
            <PlazaMap plazas={mapData.plazas} national onInspect={setHoverPlace} onSelect={selectCity} />
            <div className="radar-place">
              <small>{hoverPlace && hoverPlace.ciudad !== city ? 'VISTA PREVIA · PULSA PARA FILTRAR' : 'DETALLE DE LA PLAZA'}</small>
              <h3>{hoverPlace?.ciudad ?? (city || 'Explora el mapa')}</h3>
              {(hoverPlace || selectedPlace) && <PlaceOverview place={hoverPlace || selectedPlace} />}
              {city && <button className="btn sm" type="button" onClick={() => onInvestigate({ ...selection })}>Abrir explorador de Traspasos</button>}
            </div>
          </div>
          <small>{fmt(mapData.plazas.length)} plazas ubicadas · {fmt(mapData.sinUbicar)} nombres sin ubicación única. Las cifras geográficas de anuncios se limitan a plazas enlazadas.</small>
        </>}
      </section>
      <section className="card" style={{ marginBlock: 16 }}>
        <h2>Referencias con más actividad · {scope}</h2>
        {report.total === 0 ? <p>Sin traspasos para esta selección. Quita un filtro para ampliar el análisis.</p> : <div className="radar-table-wrap"><table className="radar-table">
          <thead><tr><th>Referencia</th><th>Traspasos</th><th>Participación</th></tr></thead>
          <tbody>{report.referencias.slice(0,10).map((row) => <tr key={[row.marca,row.modelo,row.ano].join('|')}><td>{row.marca} {row.modelo} {row.ano}</td><td>{fmt(row.cantidad)}</td><td>{fmt(row.cantidad/report.total*100,1)}%</td></tr>)}</tbody>
        </table></div>}
      </section>
    </>}
    {selection.clase && <p>El filtro de clase se aplica al análisis RUNT. La cobertura de anuncios y el mapa conservan marca y plaza, porque las fuentes no comparten una clasificación equivalente.</p>}
    <details className="card"><summary>Retomar la tasación activa</summary>
      <p>{search ? Object.values(search.query).join(' · ') : 'Todavía no hay una tasación activa.'}</p>
      <button type="button" className="btn" onClick={() => navigate('tasar')}>{search ? 'Abrir tasación' : 'Tasar un vehículo'}</button>
    </details>
  </>;
}

function PlaceOverview({ place }) {
  return <dl>
    <dt>Traspasos · RUNT · Jul–Sep 2024</dt><dd>{place.traspasos == null ? 'Sin datos' : fmt(place.traspasos)}</dd>
    <dt>Anuncios · VendeTuNave</dt><dd>{place.anuncios == null ? 'Sin datos' : fmt(place.anuncios)}</dd>
    <dt>Facebook · Filtro inicial</dt><dd>{place.facebook == null ? 'Sin datos' : fmt(place.facebook)}</dd>
    {place.visitas != null && <><dt>Demo Dealers · Visitas históricas</dt><dd>{fmt(place.visitas)}</dd><dt>Publicaciones del informe</dt><dd>{fmt(place.publicaciones,1)}</dd></>}
  </dl>;
}
function Metric({ label, value, note }) {
  return <div className="radar-kpi"><span>{label}</span><strong>{value == null ? '—' : fmt(value)}</strong><small>{note}</small></div>;
}


function NationalMap({ onInvestigate }) {
  const [data, setData] = useState(null);
  const [place, setPlace] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/usados/mapa-nacional').then((result) => {
      if (active) setData(result);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  return (
    <section className="card radar-national">
      <h2>Colombia · Cobertura por plaza</h2>
      <p>Las zonas cálidas concentran más traspasos históricos. Pasa el cursor o pulsa cerca de una plaza para ver su detalle. La capa se recalcula visualmente al cambiar el zoom.</p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Cargando mapa…</p>}
      {data && <>
        <div className="radar-heat-legend"><span>Menor concentración</span><i /><span>Mayor concentración</span></div>
        <div className="radar-national-grid">
          <PlazaMap plazas={data.plazas} national onInspect={setPlace} />
          <div className="radar-place">
            <small>RESUMEN POR PLAZA</small>
            <h3>{place?.ciudad ?? 'Selecciona un municipio'}</h3>
            {place ? <dl>
              <dt>VendeTuNave · Anuncios de origen</dt><dd>{place.anuncios == null ? 'Sin datos' : fmt(place.anuncios)}</dd>
              <dt>Facebook · Avisos con filtro inicial</dt><dd>{place.facebook == null ? 'Sin datos' : fmt(place.facebook)}</dd>
              <dt>RUNT · Traspasos (jul–sep 2024)</dt><dd>{place.traspasos == null ? 'Sin datos' : fmt(place.traspasos)}</dd>
              {place.visitas != null && <><dt>Demo Dealers · Visitas históricas</dt><dd>{fmt(place.visitas)}</dd><dt>Publicaciones según el informe</dt><dd>{fmt(place.publicaciones, 1)}</dd></>}
            </dl> : <p>Compara qué evidencia tienes en cada plaza antes de iniciar una tasación.</p>}
            {place && <button type="button" className="btn sm" onClick={() => onInvestigate(place.ciudad)}>Explorar traspasos</button>}
            <p>El informe agregado de precios de Mercado Libre se consulta en la ficha del vehículo. Su archivo carece de ciudad.</p>
          </div>
        </div>
        <small>{fmt(data.plazas.length)} plazas en el mapa{data.sinUbicar > 0 && ' · ' + fmt(data.sinUbicar) + ' nombres de plaza sin ubicación única'}</small>
      </>}
    </section>
  );
}

function Bars({ rows, label, onSelect }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <figure className="radar-bars">
      <figcaption>{label}</figcaption>
      {rows.map(([name, value]) => (
        <div className="radar-bar-row" key={name}>
          {onSelect ? <button type="button" className="radar-chart-link" onClick={() => onSelect(name)}>{name}</button> : <span>{name}</span>}
                    {onSelect ? <button type="button" className="radar-bar-track radar-bar-button" aria-label={'Filtrar por ' + name} onClick={() => onSelect(name)}><span style={{ width: (100 * value / max) + '%' }} /></button> : <div className="radar-bar-track" aria-hidden="true"><div style={{ width: (100 * value / max) + '%' }} /></div>}
          <strong>{fmt(value)}</strong>
        </div>
      ))}
    </figure>
  );
}

function PriceBand({ range }) {
  return (
    <figure className="radar-band">
      <figcaption>Rango central de precios publicados</figcaption>
      <div><span>P25<strong>{cop(range.p25)}</strong></span>
        <span>Mediana<strong>{cop(range.mediana)}</strong></span>
        <span>P75<strong>{cop(range.p75)}</strong></span></div>
      <small>Entre P25 y P75 se encuentra la mitad central de los precios publicados.</small>
    </figure>
  );
}


const transferFields = [
  ['mes', 'Mes'], ['departamento', 'Departamento'], ['ciudad', 'Ciudad'],
  ['marca', 'Marca'], ['modelo', 'Línea'], ['ano', 'Año del vehículo'],
  ['clase', 'Clase'], ['combustible', 'Combustible'],
];

function Transfers({ active, context, onAppraise }) {
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!context) return;
    const next = context ? Object.fromEntries(
      ['ciudad', 'marca', 'modelo', 'ano'].map((field) => [field, context[field]])
    ) : {};
    setFilters(next);
    setApplied(next);
  }, [context]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setReport(null);
    setLoading(true);
    setError('');
    api('/usados/traspasos' + qs(applied)).then((data) => {
      if (!cancelled) setReport(data);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, applied]);

  return (
    <>
      <form className="radar-filter" onSubmit={(event) => { event.preventDefault(); setApplied({ ...filters }); }}>
        <fieldset className="radar-fields" disabled={loading}>
          {transferFields.map(([field, label]) => (
            <label key={field}>{label}
              <input className="input" list={'runt-' + field} value={filters[field] ?? ''}
                onChange={(event) => setFilters({ ...filters, [field]: event.target.value })} />
              <datalist id={'runt-' + field}>
                {(report?.opciones[field] ?? []).slice(0, 1500).map((value) => <option key={value} value={value} />)}
              </datalist>
            </label>
          ))}
          <button type="submit" className="btn primary">Aplicar filtros</button>
          <button type="button" className="btn" onClick={() => { setFilters({}); setApplied({}); }}>Limpiar</button>
        </fieldset>
      </form>
      {loading && <p role="status">Consultando traspasos…</p>}
      {error && <p role="alert">{error}</p>}
      {report && <>
        <div className="radar-kpis">
          <Metric label="Traspasos en la selección" value={report.total} note={'Corte RUNT · ' + report.periodo.desde + ' a ' + report.periodo.hasta} />
        </div>
        <div className="radar-chart-grid radar-chart-grid--transfers"><MonthColumns rows={report.meses} label="Traspasos por mes · selección actual" />
          <Bars rows={report.plazas} label="Principales plazas · mismos filtros de vehículo y mes, sin restricción geográfica" />
        </div>
        <section className="card" style={{ marginBlock: 16 }}>
          <h2>Referencias con mayor actividad</h2>
          <p>Hasta 25 referencias ordenadas por traspasos. La participación se calcula sobre la selección completa.</p>
          {report.total === 0 ? <p>Sin traspasos para estos filtros. Amplía la selección.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="radar-table">
                <thead><tr><th>Referencia</th><th>Traspasos</th><th>Participación</th><th>Acción</th></tr></thead>
                <tbody>{report.referencias.map((ref) => (
                  <tr key={[ref.marca, ref.modelo, ref.ano].join('|')}>
                    <td>{ref.marca} {ref.modelo} {ref.ano}</td>
                    <td>{fmt(ref.cantidad)}</td>
                    <td>{fmt(100 * ref.cantidad / report.total, 1)} %</td>
                    <td><button type="button" className="btn sm" onClick={() => onAppraise(ref)}>Tasar · {ref.ciudad}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </>}
    </>
  );
}


const purchaseStates = ['En evaluación', 'Oferta enviada', 'Cerrada'];

function SavePurchase({ query, offer, onSaved }) {
  const [pedido, setPedido] = useState('');
  const [ofertaFinal, setOfertaFinal] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/usados/tasaciones', { method: 'POST', body: { query, supuestos: offer, pedido, ofertaFinal, nota } });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="radar-save"><h3>Registrar oferta</h3><p>Ingresa el precio pedido y el valor que ofrecerías.</p>
      <form onSubmit={save}>
        <fieldset className="radar-fields" disabled={busy} style={{ marginBlock: 12 }}>
          <label>Precio pedido (COP)<input className="input" type="number" min="1" max="1000000000000" required value={pedido} onChange={(event) => setPedido(event.target.value)} /></label>
          <label>Oferta final (COP)<input className="input" type="number" min="1" max="1000000000000" required value={ofertaFinal} onChange={(event) => setOfertaFinal(event.target.value)} /></label>
          <label>Motivo de la oferta<input className="input" maxLength={1000} value={nota} onChange={(event) => setNota(event.target.value)} /></label>
          <button className="btn primary" type="submit">{busy ? 'Guardando…' : 'Guardar tasación'}</button>
        </fieldset>
        {Number(pedido) > 0 && <p>Precio pedido menos máximo simulado: <strong>{cop(Number(pedido) - offer.maximo)}</strong></p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}

function PurchaseDesk({ onNew }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let active = true;
    api('/usados/tasaciones').then((data) => { if (active) setRows(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  async function update(id, estado) {
    setError('');
    setPending(id);
    try {
      await api('/usados/tasaciones/' + id, { method: 'PATCH', body: { estado } });
      setRows((current) => current.map((row) => row.id === id ? { ...row, estado } : row));
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="card">
<div className="radar-desk-header"><div><h2>Mis decisiones de compra</h2><p>Busca el vehículo, calcula el máximo y registra la oferta.</p></div><button type="button" className="btn primary" onClick={onNew}>+ Nueva tasación</button></div>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <p role="status">Cargando tasaciones…</p>}
      {rows?.length === 0 && <p>Abre una tasación con un máximo simulado para guardar tu primera oferta.</p>}
      {rows?.length > 0 && <>
        <label>Estado <select className="select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Todos</option>{purchaseStates.map((state) => <option key={state}>{state}</option>)}
        </select></label>
        {rows.filter((row) => !filter || row.estado === filter).map((row) => (
          <article key={row.id} className="card" style={{ marginBlock: 12 }}>
            <h2>{row.query.marca} {row.query.modelo} {row.query.ano} · {row.query.ciudad}</h2>
            <p>{row.query.version} · {fmt(row.query.kilometraje)} km · {row.created_at.slice(0, 10)}</p>
            <div className="radar-kpis">
              <Metric label="Precio pedido (COP)" value={row.pedido} note="Valor registrado por el asesor" />
              <Metric label="Máximo simulado (COP)" value={row.offer.maximo} note="Con los supuestos guardados" />
              <Metric label="Oferta final (COP)" value={row.ofertaFinal} note={row.ofertaFinal > row.offer.maximo ? 'Por encima del máximo' : 'Dentro del máximo'} />
            </div>
            {row.nota && <p>{row.nota}</p>}
            <label>Estado <select className="select" value={row.estado} disabled={pending !== null} onChange={(event) => void update(row.id, event.target.value)}>
              {purchaseStates.map((state) => <option key={state}>{state}</option>)}
            </select></label>
            <details style={{ marginTop: 10 }}>
              <summary>Revisar evidencia y supuestos</summary>
              <p>Reventa {cop(row.offer.reventa)} · Alistamiento {cop(row.offer.alistamiento)} · Otros costos {cop(row.offer.otrosCostos)} · Margen {row.offer.margenPorcentaje}% ({cop(row.offer.margen)})</p>
              <p>VendeTuNave · {row.evidencia.cortes.join(', ')} · {fmt(row.evidencia.elegibles)} candidatos</p>
              {row.evidencia.rango && <PriceBand range={row.evidencia.rango} />}
              <ul>{row.evidencia.anuncios.map((ad) => <li key={ad.url}>
                <a href={ad.url} target="_blank" rel="noopener noreferrer">{ad.titulo}</a> · {cop(ad.precioPublicado)} · {fmt(ad.kilometraje)} km
              </li>)}</ul>
            </details>
          </article>
        ))}
      </>}
    </section>
  );
}

function TransferPulse() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/usados/traspasos').then((data) => { if (active) setReport(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  return (
    <section className="card" style={{ marginBlock: 16 }}>
      <h2>¿Qué vehículos registraron más actividad?</h2>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">Consultando RUNT…</p>}
      {report && <>
        <p>Colombia · {fmt(report.total)} traspasos registrados · {report.periodo.desde} a {report.periodo.hasta}.</p>
        <div className="radar-chart-grid radar-chart-grid--dashboard"><Bars rows={report.marcas} label="Marcas con más traspasos" />
          <ClassShare rows={report.clases} total={report.total} />
          <MonthlyTrend rows={report.meses} />
        </div>
        <ActivityInsights report={report} />
        <Bars rows={report.referencias.slice(0, 5).map((row) => [[row.marca, row.modelo, row.ano].join(' '), row.cantidad])} label="Referencias con más traspasos" />
      </>}
    </section>
  );
}

function MonthColumns({ rows, label }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return <figure className="radar-months">
    <figcaption>{label}</figcaption>
    <div className="radar-columns">{rows.map(([month, value]) => (
      <div key={month}>
        <strong>{fmt(value)}</strong>
        <div className="radar-column-track" aria-hidden="true"><div style={{ height: (100 * value / max) + '%' }} /></div>
        <small>{month}</small>
      </div>
    ))}</div>
  </figure>;
}

function VehicleDiagram({ query, count }) {
  const canvas = useRef(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [angle, setAngle] = useState(0.55);
  const supported = query.marca.toLowerCase() === 'mazda' && query.modelo.toLowerCase().replace(/[^a-z0-9]/g, '') === 'cx30' && query.ano === '2022';

  useEffect(() => {
    if (!supported || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    let frame;
    let start;
    function render(now) {
      start ??= now;
      drawCx30(context, angle + (playing ? (now - start) / 6800 : 0));
      if (playing) frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [supported, playing, angle]);

  return <section className="radar-showroom">
    <div className="radar-showroom-info">
      <small>VEHÍCULO EVALUADO</small>
      <h3>{query.marca} {query.modelo} {query.ano}</h3>
      <p>{query.version} · {fmt(query.kilometraje)} km · {query.ciudad}</p>
      <strong>{fmt(count)} candidatos</strong>
    </div>
    {supported && <div className="radar-showroom-stage">
      <canvas ref={canvas} width={720} height={300} aria-label="Modelo tridimensional estilizado del Mazda CX-30" />
      <div className="radar-showroom-controls">
        <small>Modelo 3D estilizado · CX‑30 2022</small>
        <button type="button" className="btn sm" onClick={() => setPlaying((value) => !value)}>{playing ? 'Pausar giro' : 'Girar'}</button>
        <button type="button" className="btn sm" aria-label="Girar a la izquierda" onClick={() => { setPlaying(false); setAngle((value) => value - 0.4); }}>↶</button>
        <button type="button" className="btn sm" aria-label="Girar a la derecha" onClick={() => { setPlaying(false); setAngle((value) => value + 0.4); }}>↷</button>
      </div>
    </div>}
  </section>;
}

const cx30Mesh = buildCx30();
function buildCx30() {
  const faces = [];
  function shell(rings, colors) {
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < rings[i].length; j++) {
        const k = (j + 1) % rings[i].length;
        faces.push([[rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]], colors[j % colors.length]]);
      }
    }
    faces.push([rings[0], colors[0]], [rings.at(-1), colors[0]]);
  }
  const body = [
    [-2.2, .68, .42, .85], [-1.95, .92, .32, 1.01], [-1.2, .93, .33, 1.05],
    [.65, .92, .33, 1.03], [1.55, .87, .34, .91], [2.1, .73, .42, .82],
  ].map(([x,w,b,t]) => [[x,-w,b],[x,-w,t-.13],[x,-w*.76,t],[x,w*.76,t],[x,w,t-.13],[x,w,b]]);
  shell(body, ['#762333','#b8394b','#d45261','#b63b4c','#912d40','#263446']);
  const roof = [
    [-1.55,.66,1.01,1.06],[-.85,.71,1.05,1.57],[.55,.69,1.04,1.61],[1.5,.65,.94,1.09],
  ].map(([x,w,b,t]) => [[x,-w,b],[x,-w*.78,t],[x,w*.78,t],[x,w,b]]);
  shell(roof, ['#263f54','#a63649','#263f54','#29374a']);
  for (const x of [-1.35,1.32]) for (const side of [-1,1]) {
    const ring = (y,r) => Array.from({length: 18}, (_, i) => {
      const theta = i * Math.PI / 9;
      return [x + Math.cos(theta)*r, y, .39 + Math.sin(theta)*r];
    });
    shell([ring(side*.76,.38),ring(side*.99,.38)], ['#182433']);
    shell([ring(side*.991,.22),ring(side*1.005,.20)], ['#a9b8c7']);
  }
  faces.push([[[-2.201,-.44,.51],[-2.201,.44,.51],[-2.201,.55,.71],[-2.201,-.55,.71]],'#162536']);
  for (const side of [-1,1]) {
    faces.push([[[-2.206,side*.37,.72],[-2.206,side*.63,.74],[-2.206,side*.63,.79],[-2.206,side*.37,.77]],'#e5f3fc']);
    faces.push([[[2.105,side*.39,.69],[2.105,side*.65,.68],[2.105,side*.65,.76],[2.105,side*.39,.76]],'#ff6d75']);
  }
  return faces;
}

function drawCx30(context, angle) {
  const {width,height} = context.canvas;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  context.clearRect(0,0,width,height);
  context.fillStyle = '#d5dfed';
  context.beginPath(); context.ellipse(width/2, height*.76, 220, 24, 0, 0, Math.PI*2); context.fill();
  const projected = cx30Mesh.map(([face, color]) => {
    const points = face.map(([x,y,z]) => {
      const a=x*cos-y*sin, b=x*sin+y*cos;
      const depth=b*.92+z*.38, scale=119/(1+depth*.065);
      return [width/2+a*scale, height*.75-(z*.92-b*.38)*scale, depth];
    });
    return {points,color,depth:points.reduce((sum,p)=>sum+p[2],0)/points.length};
  }).sort((a,b)=>b.depth-a.depth);
  for(const {points,color} of projected) {
    context.beginPath();
    points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));
    context.closePath(); context.fillStyle=color; context.fill();
    context.strokeStyle='rgba(31,41,55,.16)'; context.stroke();
  }
}

function SourceComparison({ mercado, facebook }) {
  if (!mercado && !facebook) return null;
  return <section className="radar-source-section">
    <h3>Contrasta la evidencia</h3>
    {mercado && <details className="card radar-source">
      <summary><strong>Mercado Libre</strong><span>{fmt(mercado.total)} referencias agregadas</span></summary>
      <p>Precios de referencia por configuración y tramo de kilometraje. El archivo carece de ciudad, fecha de corte y tamaño de muestra.</p>
      {mercado.total === 0 ? <p>Sin coincidencias para esta búsqueda.</p> : <>
        <p>Mostrando {mercado.filas.length} de {mercado.total} filas del informe.</p>
        <div className="radar-table-wrap"><table className="radar-table radar-source-table">
          <thead><tr><th>Configuración</th><th>Tramo (km)</th><th>Mínimo</th><th>Mediana</th><th>Máximo</th></tr></thead>
          <tbody>{mercado.filas.map((row,i) => <tr key={i}>
            <td><strong>{row.version}</strong><small>{row.combustible} · {row.transmision}</small></td>
            <td>{fmt(row.desde)}–{fmt(row.hasta)}</td><td>{cop(row.minimo)}</td><td><strong>{cop(row.mediana)}</strong></td><td>{cop(row.maximo)}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </details>}
    {facebook && <details className="card radar-source">
      <summary><strong>Facebook Marketplace</strong><span>{fmt(facebook.total)} posibles comparables</span></summary>
      <p>La versión se infiere del título. Estos avisos ayudan a contrastar el mercado y quedan fuera del rango y del máximo de compra.</p>
      <small>Archivo de origen · {facebook.archivo}</small>
      {facebook.total === 0 ? <p>Sin avisos para esta búsqueda.</p> : <div className="radar-table-wrap"><table className="radar-table radar-source-table">
        <thead><tr><th>Aviso</th><th>Precio publicado</th><th>Kilometraje</th><th>Transmisión</th></tr></thead>
        <tbody>{facebook.anuncios.map((ad,i) => <tr key={ad.url + i}>
          <td><a href={ad.url} target="_blank" rel="noopener noreferrer">Abrir aviso {i+1} ↗</a></td>
          <td>{cop(ad.precio)}</td><td>{fmt(ad.kilometraje)} km</td><td>{ad.transmision || 'Sin dato'}</td>
        </tr>)}</tbody>
      </table></div>}
    </details>}
  </section>;
}


function ClassShare({ rows, total, onSelect }) {
  const displayed = rows.slice(0, 4);
  const rest = Math.max(0, total - displayed.reduce((sum, [, count]) => sum + count, 0));
  if (rest) displayed.push(['Otras clases', rest]);
  const colors = ['#1759bd','#32a5a5','#819cc9','#b6cce7','#e6edf6'];
  let angle = 0;
  const stops = displayed.map(([, count], i) => {
    const start = angle;
    angle += total ? 360 * count / total : 0;
    return colors[i] + ' ' + start + 'deg ' + angle + 'deg';
  });
  return <figure className="radar-share">
    <figcaption>¿Qué clases concentran los traspasos?</figcaption>
    <div className="radar-share-body">
      <div className="radar-donut" style={{background: total ? 'conic-gradient(' + stops.join(',') + ')' : '#e6edf6'}} aria-hidden="true"><span>{fmt(total)}<small>traspasos</small></span></div>
      <ul>{displayed.map(([name,count],i) => <li key={name}><i style={{background:colors[i]}} />{onSelect && name !== 'Otras clases' ? <button type="button" className="radar-chart-link" onClick={() => onSelect(name)}>{name}</button> : <span>{name}</span>}<strong>{fmt(total ? count/total*100 : 0,1)}%</strong><small>{fmt(count)}</small></li>)}</ul>
    </div>
  </figure>;
}

function MonthlyTrend({ rows }) {
  if (!rows.length) return null;
  const max = Math.max(1,...rows.map(([, count])=>count));
  const x = (i) => rows.length === 1 ? 250 : 40 + 420 * i / (rows.length-1);
  const y = (value) => 135 - 100 * value / max;
  const path = rows.map(([,value],i)=>(i?'L':'M')+x(i)+','+y(value)).join(' ');
  return <figure className="radar-trend">
    <figcaption>Actividad registrada mes a mes</figcaption>
    <svg viewBox="0 0 500 180" role="img" aria-label={rows.map(([month,count])=>month+': '+fmt(count)+' traspasos').join(', ')}>
      {[0,.5,1].map((f)=><line key={f} x1="35" x2="465" y1={y(max*f)} y2={y(max*f)} stroke="#e1e9f3" />)}
      <path d={path+' L'+x(rows.length-1)+',135 L'+x(0)+',135 Z'} fill="#eaf2ff" />
      <path d={path} fill="none" stroke="#1759bd" strokeWidth="3" />
      {rows.map(([month,count],i)=><g key={month}><circle cx={x(i)} cy={y(count)} r="4" fill="#1759bd" /><text x={x(i)} y={y(count)-12} textAnchor="middle" fontSize="13" fill="#17263c">{fmt(count)}</text><text x={x(i)} y="160" textAnchor="middle" fontSize="12" fill="#51627b">{month}</text></g>)}
    </svg>
    <small>La serie muestra traspasos. Cada punto conserva su valor observado.</small>
  </figure>;
}

function ActivityInsights({ report }) {
  const first = report.meses[0];
  const last = report.meses.at(-1);
  const change = first?.[1] ? (last[1]/first[1]-1)*100 : null;
  return <section className="radar-insights">
    <h3>Lecturas del corte disponible</h3>
    <div className="radar-kpis">
      <div className="radar-kpi"><span>Cambio entre meses extremos</span><strong>{change == null ? '—' : (change>0?'+':'')+fmt(change,1)+'%'}</strong><small>{first?.[0]} a {last?.[0]} · Comparación de volumen registrado</small></div>
      <div className="radar-kpi"><span>Participación de la primera marca</span><strong>{report.marcas[0] ? fmt(report.marcas[0][1]/report.total*100,1)+'%' : '—'}</strong><small>{report.marcas[0]?.[0]} · Sobre la selección actual</small></div>
    </div>
    <details className="card"><summary>Evolución de precios · Datos necesarios</summary><p>Los archivos de anuncios aportan cortes puntuales. Para graficar cambios de precio se necesitan cortes repetidos de la misma referencia, versión, plaza y banda de kilometraje. La mediana y el tamaño de muestra deben acompañar cada fecha.</p></details>
  </section>;
}





