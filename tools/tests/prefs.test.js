import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
// Preferences behaviour checks, run by tools/prefs-test.sh (plain gjs, no GNOME Shell).
import Prefs from './prefs.js';
const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const app = new Adw.Application({ application_id: 'local.nc.ptest', flags: Gio.ApplicationFlags.NON_UNIQUE });
const ok = (n, c, d = '') => print(`${c ? 'PASS' : 'FAIL'} ${n} ${d}`);
const find = (w, t) => { if (w instanceof t) return w; for (let c = w.get_first_child(); c; c = c.get_next_sibling()) { const r = find(c, t); if (r) return r; } return null; };
const findAll = (w, pred, out = []) => { if (pred(w)) out.push(w); for (let c = w.get_first_child(); c; c = c.get_next_sibling()) findAll(c, pred, out); return out; };
const named = (w, name) => findAll(w, x => x.get_name?.() === name);
app.connect('activate', () => {
  const p = new Prefs(dir);
  const win = new Adw.PreferencesWindow({ application: app });
  p.fillPreferencesWindow(win);
  const s = p.getSettings();
  win.present();
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
    const row = find(win, Adw.EntryRow);
    ok('nothing focused on open', !(win.get_focus() && row.is_ancestor && win.get_focus().is_ancestor(row)), `${win.get_focus()}`);
    const saved = s.get_string('format-string');
    row.text = '\\\\';
    ok('typing does not save', s.get_string('format-string') === saved, s.get_string('format-string'));
    row.emit('apply');
    ok('no-% format refused', s.get_string('format-string') === saved);
    row.text = '';
    row.emit('apply');
    ok('empty refused', s.get_string('format-string') === saved);
    row.text = '%H:%M';
    row.emit('apply');
    ok('valid format applied', s.get_string('format-string') === '%H:%M');
    s.set_string('format-string', '%Y-%m-%d');
    ok('external change shown', row.text === '%Y-%m-%d', row.text);
    s.reset('format-string');
    ok('reset shown', row.text === '%d/%m/%Y %H:%M:%S', row.text);
    const win2 = new Adw.PreferencesWindow({ application: app });
    s.set_string('prefs-page', 'about');
    p.fillPreferencesWindow(win2);
    ok('about page requested', win2.get_visible_page()?.title === 'Sobre' && s.get_string('prefs-page') === 'settings', win2.get_visible_page()?.title);
    // ── Editor de layout (paginas Barra e Popup) ────────────────────────
    ok('barra: 4 blocos padrao', named(win, 'ec-block-row').length === 4, `${named(win, 'ec-block-row').length}`);
    s.set_strv('bar-layout', ['time|plain|', 'text|plain|•']);
    ok('barra: reconstroi ao mudar o layout', named(win, 'ec-block-row').length === 2, `${named(win, 'ec-block-row').length}`);
    const blockRow = named(win, 'ec-block-row')[0];
    const fmtEntry = findAll(blockRow, x => x instanceof Adw.EntryRow)[0];
    fmtEntry.text = '%a %d/%m';
    fmtEntry.emit('apply');
    ok('barra: editar o formato do bloco grava', s.get_strv('bar-layout')[0] === 'time|plain|%a %d/%m', s.get_strv('bar-layout').join(' ; '));
    s.set_strv('bar-layout', ['lixo']);
    ok('barra: layout invalido mostra o padrao', named(win, 'ec-block-row').length === 4);
    s.reset('bar-layout');
    ok('popup: 5 cartoes e nenhum escondido', named(win, 'ec-card-row').length === 5 && named(win, 'ec-card-row-hidden').length === 0,
      `${named(win, 'ec-card-row').length}/${named(win, 'ec-card-row-hidden').length}`);
    s.set_strv('popup-col3', ['clock|normal']);
    ok('popup: o que sai vai para escondidos', named(win, 'ec-card-row').length === 2 && named(win, 'ec-card-row-hidden').length === 3,
      `${named(win, 'ec-card-row').length}/${named(win, 'ec-card-row-hidden').length}`);
    const hiddenBtn = findAll(named(win, 'ec-card-row-hidden')[0], x => x instanceof Gtk.Button);
    hiddenBtn[1].emit('clicked');
    ok('popup: mostrar um escondido na coluna da direita', s.get_strv('popup-col3').length === 2 && named(win, 'ec-card-row-hidden').length === 2, s.get_strv('popup-col3').join(' ; '));
    s.reset('popup-col2');
    s.reset('popup-col3');
    ok('popup: restaurar o padrao', named(win, 'ec-card-row').length === 5);
    app.quit();
    return GLib.SOURCE_REMOVE;
  });
});
app.run([]);
