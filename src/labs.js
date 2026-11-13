// SPDX-License-Identifier: MIT
// Editor de layout nas preferencias (GTK4/Adw): a pagina "Barra" compoe os blocos ao lado do relogio e a
// pagina "Popup" escolhe, ordena e dimensiona os cartoes. Tudo grava no GSettings na hora; as regras
// (validar, mover, adicionar) ficam em layoutlogic.js e sao testadas a parte.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {
  BAR_KINDS, KIND_ORDER, BAR_STYLES, STYLE_LABELS, WEATHER_MODES, CARD_LABELS, CARD_SIZES,
  DEFAULT_BAR, DEFAULT_COL2, DEFAULT_COL3,
  addBlock, cleanBar, cleanCols, hiddenCards, moveAt, moveCard, parseBlock, parseCard, removeAt,
  setCardSize, updateBlock,
} from './layoutlogic.js';
import { FORMAT_PRESETS, formatNow } from './presets.js';

// Cores da previa: a mesma paleta (Catppuccin Macchiato) usada na barra de verdade.
const CSS = `
.ecp-bar { background: #1e2030; border-radius: 18px; padding: 6px 12px; }
.ecp-text { color: #cad3f5; font-weight: 700; }
.ecp-pill { border-radius: 100px; padding: 1px 9px; font-size: 0.82em; font-weight: 700; }
.ecp-neutral { background: rgba(54, 58, 79, 0.9); color: #cad3f5; }
.ecp-blue { background: rgba(138, 173, 244, 0.18); color: #8aadf4; }
.ecp-ok { background: rgba(166, 218, 149, 0.18); color: #a6da95; }
.ecp-warn { background: rgba(238, 212, 159, 0.18); color: #eed49f; }
.ecp-crit { background: rgba(237, 135, 150, 0.22); color: #ed8796; }
`;

const PILL_CSS = {
  'pill-neutral': 'ecp-neutral', 'pill-blue': 'ecp-blue', 'pill-green': 'ecp-ok',
  'pill-yellow': 'ecp-warn', 'pill-red': 'ecp-crit', auto: 'ecp-ok',
};

function iconButton(icon, tooltip, onClick, sensitive = true) {
  const b = new Gtk.Button({ icon_name: icon, tooltip_text: tooltip, valign: Gtk.Align.CENTER, css_classes: ['flat'], sensitive });
  b.connect('clicked', onClick);
  return b;
}

/** DropDown de texto: `options` = [[valor, rotulo]]; chama onChange(valor) so por acao do usuario. */
function dropDown(options, current, onChange) {
  const dd = new Gtk.DropDown({ model: Gtk.StringList.new(options.map(([, label]) => label)), valign: Gtk.Align.CENTER });
  const i = options.findIndex(([v]) => v === current);
  dd.selected = i >= 0 ? i : 0;
  dd.connect('notify::selected', () => {
    const v = options[dd.selected]?.[0];
    if (v !== undefined && v !== current) onChange(v);
  });
  return dd;
}

function comboRow(title, subtitle, options, current, onChange) {
  const row = new Adw.ComboRow({ title, subtitle, model: Gtk.StringList.new(options.map(([, label]) => label)) });
  const i = options.findIndex(([v]) => v === current);
  row.selected = i >= 0 ? i : 0;
  row.connect('notify::selected', () => {
    const v = options[row.selected]?.[0];
    if (v !== undefined && v !== current) onChange(v);
  });
  return row;
}

const styleOptions = kind => [...BAR_STYLES, ...(kind === 'timer' ? ['auto'] : [])].map(s => [s, STYLE_LABELS[s]]);

// Texto de exemplo de um bloco na previa (timer, cronometro e clima mostram valores de amostra).
function sampleText(b, globalFormat) {
  switch (b.kind) {
    case 'time': return formatNow(b.payload || globalFormat);
    case 'timer': return '⏳ 04:32';
    case 'stopwatch': return '⏱ 12:34';
    case 'weather': return b.payload === 'icon' ? '☁' : (b.payload === 'full' ? '☁ 24° Parcialmente nublado' : '☁ 24°');
    default: return b.payload;
  }
}

// ═══ Pagina "Barra" ═══════════════════════════════════════════════════
function buildBarPage(settings) {
  const page = new Adw.PreferencesPage({ title: 'Barra', icon_name: 'view-list-symbolic' });
  const expanded = new Set();
  let rows = [];

  const read = () => cleanBar(settings.get_strv('bar-layout'));
  const save = list => settings.set_strv('bar-layout', list);

  // Prévia ao vivo
  const gPreview = new Adw.PreferencesGroup({ title: 'Prévia', description: 'Como a barra fica. Timer, cronômetro e clima só aparecem quando estão ativos; aqui mostram valores de exemplo.' });
  const previewBox = new Gtk.Box({ spacing: 8, halign: Gtk.Align.START, css_classes: ['ecp-bar'] });
  gPreview.add(previewBox);
  page.add(gPreview);

  const refreshPreview = () => {
    for (let c = previewBox.get_first_child(); c;) {
      const next = c.get_next_sibling();
      previewBox.remove(c);
      c = next;
    }
    const global = settings.get_string('format-string');
    for (const s of read()) {
      const b = parseBlock(s);
      const l = new Gtk.Label({ label: sampleText(b, global) });
      if (b.style === 'plain') l.add_css_class('ecp-text');
      else {
        l.add_css_class('ecp-pill');
        l.add_css_class(PILL_CSS[b.style] ?? 'ecp-neutral');
      }
      previewBox.append(l);
    }
  };

  // Lista de blocos
  const gList = new Adw.PreferencesGroup({ title: 'Blocos da barra', description: 'Cada bloco aparece ao lado do relógio, na ordem daqui. Toque num bloco para editar.' });
  page.add(gList);

  const buildRow = (spec, i, list) => {
    const b = parseBlock(spec);
    const row = new Adw.ExpanderRow({ title: BAR_KINDS[b.kind], subtitle: sampleText(b, settings.get_string('format-string')) });
    row.set_name('ec-block-row');
    row.expanded = expanded.has(i);
    row.connect('notify::expanded', () => (row.expanded ? expanded.add(i) : expanded.delete(i)));
    // A linha expansivel empacota os sufixos de tras para frente: adiciona na ordem inversa da exibida.
    row.add_suffix(iconButton('user-trash-symbolic', 'Remover', () => save(removeAt(list, i)), list.length > 1));
    row.add_suffix(iconButton('go-down-symbolic', 'Descer', () => save(moveAt(list, i, 1)), i < list.length - 1));
    row.add_suffix(iconButton('go-up-symbolic', 'Subir', () => save(moveAt(list, i, -1)), i > 0));

    if (b.kind === 'time') {
      const entry = new Adw.EntryRow({ title: 'Formato (strftime); vazio usa o formato global', show_apply_button: true, text: b.payload });
      entry.connect('apply', () => save(updateBlock(list, i, { payload: entry.text.trim() })));
      row.add_row(entry);
      row.add_row(comboRow('Formato pronto', 'Preenche o campo acima', [['', 'Escolher…'], ...FORMAT_PRESETS.map(p => [p.fmt, `${p.label}  ·  ${p.fmt}`])], '',
        v => save(updateBlock(list, i, { payload: v }))));
    } else if (b.kind === 'weather') {
      row.add_row(comboRow('O que mostrar', null, Object.entries(WEATHER_MODES), b.payload, v => save(updateBlock(list, i, { payload: v }))));
    } else if (b.kind === 'text') {
      const entry = new Adw.EntryRow({ title: 'Texto', show_apply_button: true, text: b.payload });
      entry.connect('apply', () => save(updateBlock(list, i, { payload: entry.text })));
      row.add_row(entry);
    }
    row.add_row(comboRow('Estilo', null, styleOptions(b.kind), b.style, v => save(updateBlock(list, i, { style: v }))));
    return row;
  };

  const rebuild = () => {
    for (const r of rows) gList.remove(r);
    const list = read();
    rows = list.map((spec, i) => buildRow(spec, i, list));
    for (const r of rows) gList.add(r);
    refreshPreview();
  };

  // Adicionar bloco
  const gAdd = new Adw.PreferencesGroup();
  const addRow = new Adw.ActionRow({ title: 'Adicionar bloco', subtitle: 'Até 8 blocos' });
  let kindToAdd = KIND_ORDER[0];
  const kindDd = dropDown(KIND_ORDER.map(k => [k, BAR_KINDS[k]]), kindToAdd, v => { kindToAdd = v; });
  addRow.add_suffix(kindDd);
  addRow.add_suffix(iconButton('list-add-symbolic', 'Adicionar', () => save(addBlock(read(), kindToAdd))));
  gAdd.add(addRow);
  const resetRow = new Adw.ActionRow({ title: 'Restaurar a barra padrão', subtitle: 'Hora, cronômetro, timer e temperatura' });
  const resetBtn = new Gtk.Button({ label: 'Restaurar', valign: Gtk.Align.CENTER, css_classes: ['destructive-action'] });
  resetBtn.connect('clicked', () => save([...DEFAULT_BAR]));
  resetRow.add_suffix(resetBtn);
  gAdd.add(resetRow);
  page.add(gAdd);

  const ids = [settings.connect('changed::bar-layout', rebuild), settings.connect('changed::format-string', refreshPreview)];
  rebuild();
  const tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
    refreshPreview();
    return GLib.SOURCE_CONTINUE;
  });
  return { page, dispose: () => { GLib.source_remove(tick); ids.forEach(id => settings.disconnect(id)); } };
}

// ═══ Pagina "Popup" ═══════════════════════════════════════════════════
function buildPopupPage(settings) {
  const page = new Adw.PreferencesPage({ title: 'Popup', icon_name: 'view-grid-symbolic' });
  const read = () => cleanCols(settings.get_strv('popup-col2'), settings.get_strv('popup-col3'));
  const save = (c2, c3) => {
    settings.set_strv('popup-col2', c2);
    settings.set_strv('popup-col3', c3);
  };

  const gMid = new Adw.PreferencesGroup({ title: 'Abaixo do calendário', description: 'Coluna do meio do popup do relógio.' });
  const gRight = new Adw.PreferencesGroup({ title: 'Coluna da direita', description: 'Coluna extra à direita do calendário. Vazia, ela some.' });
  const gHidden = new Adw.PreferencesGroup({ title: 'Escondidos', description: 'Cartões que não aparecem no popup.' });
  page.add(gMid);
  page.add(gRight);
  page.add(gHidden);
  const rowsBy = { mid: [], right: [], hidden: [] };

  const cardRow = (spec, i, list, col, c2, c3) => {
    const c = parseCard(spec);
    const row = new Adw.ActionRow({ title: CARD_LABELS[c.id] });
    row.set_name('ec-card-row');
    const sizeDd = dropDown(Object.entries(CARD_SIZES), c.size, v => {
      if (col === 'mid') save(setCardSize(c2, i, v), c3);
      else save(c2, setCardSize(c3, i, v));
    });
    row.add_suffix(sizeDd);
    row.add_suffix(iconButton('go-up-symbolic', 'Subir', () => (col === 'mid' ? save(moveAt(c2, i, -1), c3) : save(c2, moveAt(c3, i, -1))), i > 0));
    row.add_suffix(iconButton('go-down-symbolic', 'Descer', () => (col === 'mid' ? save(moveAt(c2, i, 1), c3) : save(c2, moveAt(c3, i, 1))), i < list.length - 1));
    const other = col === 'mid' ? 'col3' : 'col2';
    row.add_suffix(iconButton(col === 'mid' ? 'go-next-symbolic' : 'go-previous-symbolic',
      col === 'mid' ? 'Mover para a coluna da direita' : 'Mover para baixo do calendário',
      () => save(...moveCard(c2, c3, c.id, other))));
    row.add_suffix(iconButton('window-close-symbolic', 'Esconder', () => save(...moveCard(c2, c3, c.id, 'hidden'))));
    return row;
  };

  const rebuild = () => {
    for (const [g, key] of [[gMid, 'mid'], [gRight, 'right'], [gHidden, 'hidden']]) {
      for (const r of rowsBy[key]) g.remove(r);
      rowsBy[key] = [];
    }
    const [c2, c3] = read();
    c2.forEach((s, i) => rowsBy.mid.push(cardRow(s, i, c2, 'mid', c2, c3)));
    c3.forEach((s, i) => rowsBy.right.push(cardRow(s, i, c3, 'right', c2, c3)));
    for (const id of hiddenCards(c2, c3)) {
      const row = new Adw.ActionRow({ title: CARD_LABELS[id] });
      row.set_name('ec-card-row-hidden');
      row.add_suffix(iconButton('go-bottom-symbolic', 'Mostrar abaixo do calendário', () => save(...moveCard(c2, c3, id, 'col2'))));
      row.add_suffix(iconButton('go-next-symbolic', 'Mostrar na coluna da direita', () => save(...moveCard(c2, c3, id, 'col3'))));
      rowsBy.hidden.push(row);
    }
    rowsBy.mid.forEach(r => gMid.add(r));
    rowsBy.right.forEach(r => gRight.add(r));
    rowsBy.hidden.forEach(r => gHidden.add(r));
    gHidden.visible = rowsBy.hidden.length > 0;
  };

  const gReset = new Adw.PreferencesGroup();
  const resetRow = new Adw.ActionRow({ title: 'Restaurar o popup padrão', subtitle: 'Clima abaixo do calendário; hora, timer, cronômetro e ações à direita' });
  const resetBtn = new Gtk.Button({ label: 'Restaurar', valign: Gtk.Align.CENTER, css_classes: ['destructive-action'] });
  resetBtn.connect('clicked', () => save([...DEFAULT_COL2], [...DEFAULT_COL3]));
  resetRow.add_suffix(resetBtn);
  gReset.add(resetRow);
  page.add(gReset);

  const ids = [settings.connect('changed::popup-col2', rebuild), settings.connect('changed::popup-col3', rebuild)];
  rebuild();
  return { page, dispose: () => ids.forEach(id => settings.disconnect(id)) };
}

let cssLoaded = false;
function loadCss() {
  if (cssLoaded) return;
  const display = Gdk.Display.get_default();
  if (!display) return;
  const p = new Gtk.CssProvider();
  p.load_from_string(CSS);
  Gtk.StyleContext.add_provider_for_display(display, p, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
  cssLoaded = true;
}

/** Cria as paginas "Barra" e "Popup". Devolve { pages, dispose } (dispose solta timers e sinais). */
export function buildLabs(settings) {
  loadCss();
  const bar = buildBarPage(settings);
  const popup = buildPopupPage(settings);
  return { pages: [bar.page, popup.page], dispose: () => { bar.dispose(); popup.dispose(); } };
}
