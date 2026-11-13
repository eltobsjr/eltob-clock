import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
// Salva capturas das paginas das preferencias em EC_SHOT_DIR (usado por tools/prefs-shots.sh).
import Prefs from './prefs.js';
const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const out = GLib.getenv('EC_SHOT_DIR');
const app = new Adw.Application({ application_id: 'local.nc.pshot', flags: Gio.ApplicationFlags.NON_UNIQUE });
const findAll = (w, pred, acc = []) => { if (pred(w)) acc.push(w); for (let c = w.get_first_child(); c; c = c.get_next_sibling()) findAll(c, pred, acc); return acc; };
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));

function save(win, path) {
  const paintable = new Gtk.WidgetPaintable({ widget: win });
  const snap = new Gtk.Snapshot();
  paintable.snapshot(snap, win.get_width(), win.get_height());
  const node = snap.to_node();
  const tex = win.get_native().get_renderer().render_texture(node, null);
  tex.save_to_png(path);
  print(`SHOT ${path}`);
}

app.connect('activate', async () => {
  const p = new Prefs(dir);
  const win = new Adw.PreferencesWindow({ application: app, default_width: 720, default_height: 1000 });
  p.fillPreferencesWindow(win);
  const s = p.getSettings();
  s.set_strv('bar-layout', ['time|plain|%a %d/%m', 'time|pill-blue|%H:%M', 'text|plain|•', 'timer|auto|', 'stopwatch|pill-green|', 'weather|pill-neutral|full']);
  s.set_strv('popup-col2', ['timer|compact', 'weather|normal']);
  s.set_strv('popup-col3', ['clock|compact', 'stopwatch|compact', 'actions|compact']);
  win.present();
  await wait(900);
  const pages = findAll(win, x => x instanceof Adw.PreferencesPage);
  for (const [title, file] of [['Barra', 'prefs-barra.png'], ['Popup', 'prefs-popup.png']]) {
    const pg = pages.find(x => x.title === title);
    win.set_visible_page(pg);
    await wait(700);
    save(win, `${out}/${file}`);
  }
  app.quit();
});
app.run([]);
