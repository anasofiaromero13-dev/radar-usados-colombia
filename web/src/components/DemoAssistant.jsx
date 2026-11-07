import React, { useState } from 'react';
import { api, cop, fmt, qs } from '../api.js';
import { calcularOferta } from '../oferta-usados.js';

const clean = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const prompts = [
  ['marcas', '¿Qué marcas tienen más traspasos?'],
  ['plazas', 'Comparar plazas para mi vehículo'],
  ['comparables', 'Ver comparables de mi vehículo'],
  ['ofertas', 'Revisar ofertas sobre el máximo'],
];

export default function DemoAssistant({ context, result, onSearch, onTransfers, navigate }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const vehicle = context && ['marca','modelo','ano','ciudad','version','kilometraje'].every((key) => context[key]);

  async function ask(text, intent) {
    if (busy || !text.trim()) return;
    setMessages((current) => [...current, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    let answer;
    try {
      const normalized = clean(text);
      const task = intent ?? (
        /ofertas|guardadas|mesa de compras/.test(normalized) ? 'ofertas' :
        /alistamiento|margen|recalcula/.test(normalized) ? 'simular' :
        /comparables|anuncios/.test(normalized) ? 'comparables' :
        /plazas|ciudades|compara/.test(normalized) ? 'plazas' :
        /marcas|traspasos/.test(normalized) ? 'marcas' : 'ayuda'
      );
      if (task === 'marcas') {
        const scope = context?.ciudad ? { ciudad: context.ciudad } : {};
        const data = await api('/usados/traspasos' + qs(scope));
        answer = {
          text: 'Marcas con más traspasos · ' + (scope.ciudad || 'Colombia'),
          note: 'RUNT · ' + data.periodo.desde + ' a ' + data.periodo.hasta + ' · ' + fmt(data.total) + ' traspasos en la selección.',
          rows: data.marcas.slice(0, 5).map(([name, count]) => [name, fmt(count)]),
          action: { label: 'Explorar traspasos', type: 'transfers', query: scope },
        };
      } else if (task === 'ofertas') {
        const rows = await api('/usados/tasaciones');
        const above = rows.filter((row) => row.ofertaFinal > row.offer.maximo);
        answer = {
          text: above.length ? above.length + ' ofertas superan el máximo guardado.' : 'Ninguna oferta guardada supera su máximo.',
          note: rows.length + ' tasaciones recuperadas de esta cuenta, hasta 200 de las más recientes.',
          rows: above.slice(0, 5).map((row) => [row.query.marca + ' ' + row.query.modelo, '+' + cop(row.ofertaFinal - row.offer.maximo)]),
          action: { label: 'Abrir Mesa de compras', type: 'navigate', view: 'compras' },
        };
      } else if (['plazas', 'comparables'].includes(task)) {
        if (!vehicle) {
          answer = { text: 'Completa marca, línea, año, ciudad, versión y kilometraje en Tasar vehículo. Después puedo consultar ese vehículo.',
            action: { label: 'Completar vehículo', type: 'navigate', view: 'tasar' } };
        } else {
          const data = await api('/usados/comparables' + qs(context));
          answer = {
            text: context.marca + ' ' + context.modelo + ' ' + context.ano + ' · ' + context.version,
            note: 'VendeTuNave · ' + data.cortes.join(', ') + ' · ' + data.elegibles + ' candidatos en ' + context.ciudad,
            rows: task === 'plazas' ? data.plazas.slice(0, 5).map((row) => [row.ciudad, row.candidatos + ' candidatos']) :
              data.anuncios.slice(0, 4).map((row) => [row.titulo, cop(row.precioPublicado), row.url]),
            action: { label: 'Abrir ficha con estos filtros', type: 'search', query: { ...context } },
          };
        }
      } else if (task === 'simular') {
        const group = result?.grupos?.find((row) => row.ofertaSimulada);
        const money = normalized.match(/alistamiento(?:\s+de|\s+a|\s+en|\s+con)?\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(millones?|millon)?/);
        const percent = normalized.match(/margen(?:\s+de|\s+a|\s+en)?\s*(\d+)\s*%/);
        if (!group) {
          answer = { text: 'Primero busca un vehículo con un escenario de compra disponible.', action: { label: 'Abrir tasación', type: 'navigate', view: 'tasar' } };
        } else if (!money && !percent) {
          answer = { text: 'Puedes escribir «Recalcula con alistamiento de 3 millones» o «Recalcula con margen de 12%».' };
        } else {
          const values = { ...group.ofertaSimulada };
          if (money) values.alistamiento = money[2] ? Math.round(Number(money[1].replace(',', '.')) * 1000000) : Number(money[1]);
          if (percent) values.margenPorcentaje = Number(percent[1]);
          const offer = calcularOferta(values);
          answer = offer ? {
            text: 'Máximo simulado · ' + cop(offer.maximo) + ' COP',
            note: 'Escenario calculado en el asistente desde los supuestos iniciales del resultado. Puedes trasladar estos valores a la ficha.',
            rows: [['Reventa',cop(offer.reventa)],['Alistamiento',cop(offer.alistamiento)],['Otros costos',cop(offer.otrosCostos)],['Margen',offer.margenPorcentaje + '% · ' + cop(offer.margen)]],
            action: { label: 'Abrir calculadora de la ficha', type: 'navigate', view: 'tasar' },
          } : { text: 'Revisa el importe de alistamiento o el porcentaje de margen. Puedes usar valores enteros y margen entre 0 y 100%.' };
        }
      } else {
        answer = { text: 'Puedo consultar marcas con más traspasos, comparar plazas, revisar comparables, simular alistamiento o margen y revisar ofertas guardadas. Usa una pregunta sugerida para empezar.' };
      }
    } catch (error) {
      answer = { text: error.message };
    } finally {
      setBusy(false);
    }
    setMessages((current) => [...current, { role: 'assistant', ...answer }]);
  }

  function act(action) {
    setOpen(false);
    if (action.type === 'search') onSearch(action.query);
    else if (action.type === 'transfers') onTransfers(action.query);
    else navigate(action.view);
  }

  return <>
    <button type="button" className="radar-assistant-launch" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {open ? 'Cerrar asistente' : '✦ Asistente de demo'}
    </button>
    {open && <aside className="radar-assistant" aria-label="Asistente de demo">
      <header><h2>Asistente de demo</h2><button type="button" className="btn sm" onClick={() => setOpen(false)} aria-label="Cerrar asistente">×</button></header>
      <p className="radar-assistant-scope">{vehicle ? [context.marca,context.modelo,context.ano,context.ciudad].join(' · ') : 'Sin vehículo completo seleccionado'}</p>
      <small>Consultas guiadas a las bases cargadas. Sin conexión a un modelo de IA externo.</small>
      <div className="radar-assistant-prompts">{prompts.map(([intent, label]) => <button type="button" key={intent} disabled={busy} onClick={() => void ask(label, intent)}>{label}</button>)}</div>
      <div className="radar-assistant-messages" aria-live="polite">
        {messages.map((message, index) => <article key={index} className={'radar-chat-' + message.role}>
          <strong>{message.text}</strong>
          {message.note && <p>{message.note}</p>}
          {message.rows && <ul>{message.rows.map(([name,value,url],i) => <li key={i}>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer">{name}</a> : <span>{name}</span>}
            <b>{value}</b>
          </li>)}</ul>}
          {message.action && <button type="button" className="btn sm" onClick={() => act(message.action)}>{message.action.label}</button>}
        </article>)}
        {busy && <p role="status">Consultando datos…</p>}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void ask(input); }}>
        <label htmlFor="radar-question">Tu consulta</label>
        <input id="radar-question" className="input" value={input} maxLength={300} onChange={(event) => setInput(event.target.value)} placeholder="Ej. Recalcula con alistamiento de 3 millones" />
        <button type="submit" className="btn primary" disabled={busy || !input.trim()}>Consultar</button>
      </form>
    </aside>}
  </>;
}
