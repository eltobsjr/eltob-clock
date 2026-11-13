// SPDX-License-Identifier: MIT
// Regras puras do layout editavel: blocos da barra e cartoes do popup. Sem imports do GNOME
// (testavel com node). Os dois layouts sao listas de texto no GSettings; aqui ficam
// o formato, a validacao e as operacoes de mover/adicionar/remover.

// ── Barra ───────────────────────────────────────────────────────────
export const BAR_KINDS = {
  time: 'Hora ou data',
  timer: 'Timer',
  stopwatch: 'Cronômetro',
  weather: 'Clima',
  text: 'Texto livre',
};
export const KIND_ORDER = ['time', 'timer', 'stopwatch', 'weather', 'text'];

// Estilos: texto puro (herda a fonte do relogio) ou pilula colorida. "auto" so vale para o timer
// (verde, amarelo e vermelho conforme o tempo que falta).
export const BAR_STYLES = ['plain', 'pill-neutral', 'pill-blue', 'pill-green', 'pill-yellow', 'pill-red'];
export const STYLE_LABELS = {
  plain: 'Texto',
  'pill-neutral': 'Pílula cinza',
  'pill-blue': 'Pílula azul',
  'pill-green': 'Pílula verde',
  'pill-yellow': 'Pílula amarela',
  'pill-red': 'Pílula vermelha',
  auto: 'Pílula por estado',
};
export const WEATHER_MODES = { temp: 'Ícone e temperatura', full: 'Ícone, temperatura e condição', icon: 'Só o ícone' };

export const MAX_BAR_BLOCKS = 8;
export const MAX_TEXT_LENGTH = 24;

// Hora em branco = usa o formato global (o mesmo dos presets).
export const DEFAULT_BAR = ['time|plain|', 'stopwatch|pill-blue|', 'timer|auto|', 'weather|pill-neutral|temp'];

const defaultStyle = kind => (kind === 'timer' ? 'auto' : kind === 'stopwatch' ? 'pill-blue' : kind === 'weather' ? 'pill-neutral' : 'plain');

export function validStyle(kind, style) {
  if (style === 'auto') return kind === 'timer';
  return BAR_STYLES.includes(style);
}

/** "kind|style|payload" -> { kind, style, payload } ou null quando o tipo e invalido. */
export function parseBlock(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split('|');
  const kind = parts[0];
  if (!(kind in BAR_KINDS)) return null;
  const style = validStyle(kind, parts[1]) ? parts[1] : defaultStyle(kind);
  let payload = parts.slice(2).join('|');
  if (kind === 'weather' && !(payload in WEATHER_MODES)) payload = 'temp';
  if (kind === 'text') payload = payload.slice(0, MAX_TEXT_LENGTH);
  if (kind === 'timer' || kind === 'stopwatch') payload = '';
  return { kind, style, payload };
}

export function serializeBlock(b) {
  return `${b.kind}|${b.style}|${b.payload ?? ''}`;
}

/** Valida a lista inteira; lista vazia vira o padrao (a barra nunca fica sem relogio). */
export function cleanBar(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const b = parseBlock(s);
    if (b) out.push(serializeBlock(b));
    if (out.length === MAX_BAR_BLOCKS) break;
  }
  return out.length > 0 ? out : [...DEFAULT_BAR];
}

export function newBlock(kind) {
  const b = parseBlock(kind === 'text' ? 'text|plain|•' : kind === 'time' ? 'time|plain|%H:%M' : `${kind}||`);
  return serializeBlock(b);
}

export function addBlock(list, kind) {
  if (list.length >= MAX_BAR_BLOCKS) return list;
  return [...list, newBlock(kind)];
}

export function removeAt(list, i) {
  if (i < 0 || i >= list.length) return list;
  const next = list.filter((_, k) => k !== i);
  return next.length > 0 ? next : list; // nunca esvazia
}

export function moveAt(list, i, delta) {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function updateBlock(list, i, patch) {
  if (i < 0 || i >= list.length) return list;
  const cur = parseBlock(list[i]);
  if (!cur) return list;
  const merged = parseBlock(serializeBlock({ ...cur, ...patch }));
  const next = [...list];
  next[i] = serializeBlock(merged);
  return next;
}

// ── Popup ───────────────────────────────────────────────────────────
export const CARD_LABELS = {
  clock: 'Hora formatada',
  timer: 'Timer',
  stopwatch: 'Cronômetro',
  weather: 'Clima',
  actions: 'Ações',
};
export const CARD_IDS = ['clock', 'timer', 'stopwatch', 'weather', 'actions'];
export const CARD_SIZES = { normal: 'Normal', compact: 'Compacto' };

export const DEFAULT_COL2 = ['weather|normal'];
export const DEFAULT_COL3 = ['clock|normal', 'timer|normal', 'stopwatch|normal', 'actions|normal'];

export function parseCard(str) {
  if (typeof str !== 'string') return null;
  const [id, size] = str.split('|');
  if (!CARD_IDS.includes(id)) return null;
  return { id, size: size in CARD_SIZES ? size : 'normal' };
}

export const serializeCard = c => `${c.id}|${c.size}`;

/** Valida as duas colunas: sem repetidos (vale o primeiro, coluna do meio antes), sem ids invalidos. */
export function cleanCols(col2, col3) {
  const seen = new Set();
  const pick = list => {
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
      const c = parseCard(s);
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(serializeCard(c));
    }
    return out;
  };
  const a = pick(col2);
  const b = pick(col3);
  return [a, b];
}

/** Cartoes que nao estao em nenhuma coluna. */
export function hiddenCards(col2, col3) {
  const used = new Set([...col2, ...col3].map(s => parseCard(s)?.id));
  return CARD_IDS.filter(id => !used.has(id));
}

/** Tira o cartao de onde estiver e poe em `to` ('col2' | 'col3' | 'hidden'), no fim da coluna. */
export function moveCard(col2, col3, id, to) {
  const find = list => list.find(s => parseCard(s)?.id === id);
  const existing = find(col2) ?? find(col3) ?? `${id}|normal`;
  const strip = list => list.filter(s => parseCard(s)?.id !== id);
  let a = strip(col2);
  let b = strip(col3);
  if (to === 'col2') a = [...a, existing];
  else if (to === 'col3') b = [...b, existing];
  return [a, b];
}

export function setCardSize(list, i, size) {
  if (i < 0 || i >= list.length || !(size in CARD_SIZES)) return list;
  const c = parseCard(list[i]);
  if (!c) return list;
  const next = [...list];
  next[i] = serializeCard({ ...c, size });
  return next;
}

export const moveCardAt = moveAt;
