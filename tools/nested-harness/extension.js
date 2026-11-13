// Harness do tools/nested-smoke-test.sh — nunca vai no zip da release.
// Conduz o Eltob Clock dentro de um GNOME Shell isolado e escreve linhas "NCTEST".
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GWeather from 'gi://GWeather';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot', 'screenshot_finish');

const UUID = 'eltob-clock@eltobsjr.gmail.com';
const L = (...a) => console.log('NCTEST', ...a);
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
  r();
  return GLib.SOURCE_REMOVE;
}));
const fmt = f => GLib.DateTime.new_now_local().format(f);

function ncSettings() {
  const ext = Main.extensionManager.lookup(UUID);
  const src = Gio.SettingsSchemaSource.new_from_directory(`${ext.path}/schemas`,
    Gio.SettingsSchemaSource.get_default(), false);
  return new Gio.Settings({ settings_schema: src.lookup('org.gnome.shell.extensions.eltob-clock', false) });
}

function check(name, ok, detail = '') {
  L(ok ? 'PASS' : 'FAIL', name, detail);
}

// Percorre a arvore de atores procurando por classe de estilo.
function findByClass(root, cls) {
  const out = [];
  (function walk(a) {
    if (a.has_style_class_name?.(cls)) out.push(a);
    for (const c of a.get_children?.() ?? []) walk(c);
  })(root);
  return out;
}


// Capturas de tela para conferir o visual (so quando EC_SHOT_DIR esta definido). O clima usa dados de exemplo.
async function snap(path) {
  const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await new Shell.Screenshot().screenshot(false, stream);
  stream.close(null);
}

function fakeWeatherClient() {
  const now = Math.floor(GLib.get_real_time() / 1e6);
  const fc = (h, t, icon) => ({
    get_value_update: () => [true, now + h * 3600],
    get_value_temp: () => [true, t],
    get_symbolic_icon_name: () => icon,
  });
  const info = {
    is_valid: () => true,
    network_error: () => false,
    get_value_temp: () => [true, 24],
    get_value_temp_max: () => [true, 27],
    get_value_temp_min: () => [true, 22],
    get_symbolic_icon_name: () => 'weather-few-clouds-symbolic',
    get_conditions: () => 'Parcialmente nublado',
    get_sky: () => 'Parcialmente nublado',
    get_apparent: () => '26 °C',
    get_wind: () => 'Leste, 18 km/h',
    get_humidity: () => '72%',
    get_forecast_list: () => [fc(1, 24, 'weather-few-clouds-symbolic'), fc(2, 23, 'weather-few-clouds-symbolic'),
      fc(3, 23, 'weather-clear-night-symbolic'), fc(4, 22, 'weather-clear-night-symbolic'), fc(5, 22, 'weather-clear-night-symbolic')],
    location: { get_name: () => 'Fortaleza', get_level: () => GWeather.LocationLevel.CITY, has_coords: () => true },
  };
  return { available: true, hasLocation: true, loading: false, info, connect: () => 1, disconnect() {}, update() {}, activateApp() {} };
}

async function visualShots(s, dm, inst) {
  const dir = GLib.getenv('EC_SHOT_DIR');
  const ext = Main.extensionManager.lookup(UUID);
  const { WeatherCard } = await import(`file://${ext.path}/weatherview.js`);
  const st = inst()._state;
  const now = () => Math.floor(GLib.get_real_time() / 1000);

  inst()._weatherCard?.destroy();
  inst()._weatherCard = new WeatherCard(fakeWeatherClient());
  dm._displaysSection.get_parent().add_child(inst()._weatherCard.actor);
  s.set_string('format-string', '%d/%m/%Y %H:%M:%S');

  // timer a 45% e cronometro correndo, para ver as pilulas e o anel
  st.tm = { state: 'running', durationMs: 600000, endsAt: now() + 272000, remainingMs: 600000 };
  st.sw = { running: false, startedAt: 0, accumulated: 754000 };
  st._changed();
  inst()._pills._client = inst()._client;
  Main.panel.statusArea.dateMenu.menu.open();
  await wait(900);
  await snap(`${dir}/popup-aberto.png`);
  inst()._column._actions._toggleSub('presets');
  await wait(300);
  await snap(`${dir}/popup-presets.png`);
  inst()._column._actions._toggleSub('presets');
  // timer quase no fim (vermelho)
  st.tm = { state: 'running', durationMs: 600000, endsAt: now() + 40000, remainingMs: 600000 };
  st._changed();
  await wait(400);
  await snap(`${dir}/popup-timer-vermelho.png`);
  dm.menu.close();
  await wait(300);
  st.tmCancel();
  st.swReset();
  L('capturas em', dir);
}

async function run() {
  await wait(2000);
  const s = ncSettings();
  const dm = Main.panel.statusArea.dateMenu;
  const clock = () => dm._clockDisplay.text;
  const inst = () => Main.extensionManager.lookup(UUID)?.stateObj;
  const hbox = () => dm._messageList.get_parent();

  check('extensao ativa', Main.extensionManager.lookup(UUID)?.state === 1);

  // ── Texto do relogio (herdado do Numeric Clock) ────────────────────
  const first = clock();
  check('formato padrao', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(first), first);
  await wait(1100);
  check('tique a cada segundo', clock() !== first, `${first} -> ${clock()}`);

  const offsets = [];
  const ct = dm._clockDisplay.clutter_text;
  const id = ct.connect('notify::text', () => offsets.push((GLib.get_real_time() / 1000) % 1000));
  await wait(3200);
  ct.disconnect(id);
  check('alinhado ao segundo', offsets.length >= 2 && offsets.every(o => o < 150), offsets.map(Math.round).join(','));

  s.set_string('format-string', '%Y-%m-%d %H:%M');
  await wait(50);
  check('mudar formato', clock() === fmt('%Y-%m-%d %H:%M'), clock());
  s.set_string('format-string', '');
  await wait(50);
  check('formato vazio volta ao padrao', clock() === fmt('%d/%m/%Y %H:%M:%S'), clock());
  s.set_string('format-string', '%H:%M:%S');
  dm._clockDisplay.text = 'stock';
  check('reescrita do shell e sobrescrita', clock() !== 'stock', clock());
  s.set_string('format-string', '<b>%H</b>');
  await wait(50);
  check('texto puro (sem markup)', clock() === fmt('<b>%H</b>') && !ct.use_markup, clock());
  s.set_string('format-string', '%d/%m/%Y %H:%M:%S');

  // ── Popup: terceira coluna e secoes nativas ────────────────────────
  const cols = findByClass(hbox(), 'ec-col');
  check('terceira coluna no popup', cols.length === 1, `n=${cols.length}`);
  check('eventos e relogios mundiais escondidos', !dm._displaysSection.visible);
  check('cartao de clima abaixo do calendario', findByClass(dm._displaysSection.get_parent(), 'ec-weather').length === 1);
  check('pilulas na barra criadas', findByClass(dm, 'ec-pills').length === 1);
  const st = inst()._state;
  const pills = inst()._pills;

  dm.menu.open();
  await wait(400);
  check('popup abre', dm.menu.isOpen);
  check('hora formatada na coluna', inst()._column._clock.text.length > 0, inst()._column._clock.text);

  // ── Timer ──────────────────────────────────────────────────────────
  check('timer inicia ocioso', st.tm.state === 'idle' && !pills._tm.visible);
  st.tmStart(1);
  await wait(200);
  check('timer em andamento', st.tm.state === 'running' && pills._tm.visible && /⏳ 01:00/.test(pills._tm.text), pills._tm.text);
  check('timer verde', pills._tm.style_class.includes('ec-pill-ok'), pills._tm.style_class);
  st.tmPauseResume();
  await wait(100);
  check('timer pausado', st.tm.state === 'paused' && /⏸/.test(pills._tm.text), pills._tm.text);
  st.tmPauseResume();
  await wait(100);
  check('timer retomado', st.tm.state === 'running');
  st.tmCancel();
  await wait(100);
  check('timer cancelado', st.tm.state === 'idle' && !pills._tm.visible);
  // fim do timer: 700 ms
  st.tm = { state: 'running', durationMs: 700, endsAt: Math.floor(GLib.get_real_time() / 1000) + 700, remainingMs: 700 };
  st._changed();
  await wait(1800);
  check('timer termina sozinho', st.tm.state === 'idle' && !pills._tm.visible);

  // ── Cronometro ─────────────────────────────────────────────────────
  check('cronometro inicia zerado', !st.sw.running && !pills._sw.visible);
  st.swToggle();
  await wait(1300);
  check('cronometro conta', st.sw.running && pills._sw.visible && /⏱ 00:0[1-3]/.test(pills._sw.text), pills._sw.text);
  st.swToggle();
  const frozen = st.swElapsed();
  await wait(700);
  check('cronometro pausa', !st.sw.running && st.swElapsed() === frozen && /⏸/.test(pills._sw.text), pills._sw.text);
  st.swReset();
  await wait(100);
  check('cronometro zera', st.swElapsed() === 0 && !pills._sw.visible);
  s.set_boolean('bar-pills', false);
  st.swToggle();
  await wait(100);
  check('pilulas desligadas escondem', !pills._sw.visible);
  st.swReset();
  s.set_boolean('bar-pills', true);

  // ── Acoes: presets e estilo ────────────────────────────────────────
  const actions = inst()._column._actions;
  actions._toggleSub('presets');
  check('lista de presets', actions._sub.get_n_children() === 8 && actions._scroll.visible, `n=${actions._sub.get_n_children()}`);
  actions._sub.get_child_at_index(1).emit('clicked', 0);
  await wait(100);
  check('preset aplicado', s.get_string('format-string') === '%A %d/%m/%Y %H:%M:%S', s.get_string('format-string'));
  s.reset('format-string');
  actions._toggleSub('style');
  check('lista de estilos', actions._sub.get_n_children() === 3 && actions._scroll.visible);
  for (const style of ['light', 'dark', 'system']) {
    s.set_string('menu-style', style);
    await wait(50);
    const cls = inst()._column.actor.get_style_class_name();
    const others = ['light', 'dark'].filter(x => x !== style);
    check(`estilo ${style}`, (style === 'system' || cls.includes(`ec-style-${style}`)) && others.every(x => !cls.includes(`ec-style-${x}`)), cls);
  }
  actions._closeSub();

  // ── Clima ──────────────────────────────────────────────────────────
  const wc = inst()._weatherCard;
  check('cartao de clima com conteudo', !!wc && wc.actor.get_n_children() >= 2, `filhos=${wc?.actor.get_n_children()}`);
  s.set_boolean('weather-enabled', false);
  await wait(100);
  check('clima desligavel', !inst()._weatherCard && findByClass(dm._displaysSection.get_parent(), 'ec-weather').length === 0);
  s.set_boolean('weather-enabled', true);
  await wait(100);
  check('clima religavel', !!inst()._weatherCard);

  dm.menu.close();
  await wait(300);
  check('popup fecha', !dm.menu.isOpen);

  if (GLib.getenv('EC_SHOT_DIR')) await visualShots(s, dm, inst);

  // ── Modo fora da barra ─────────────────────────────────────────────
  s.set_boolean('only-topbar', false);
  await wait(1200);
  check('only-topbar off ainda formata', clock() === fmt('%d/%m/%Y %H:%M:%S'), clock());
  s.set_boolean('only-topbar', true);

  // ── Desativar devolve tudo; reativar refaz ─────────────────────────
  await Main.extensionManager.disableExtension(UUID);
  await wait(300);
  check('desativar restaura o relogio', clock() === dm._clock.clock, `${clock()} vs ${dm._clock.clock}`);
  check('coluna removida', findByClass(hbox(), 'ec-col').length === 0);
  check('pilulas removidas', findByClass(dm, 'ec-pills').length === 0);
  check('cartao de clima removido', findByClass(dm._displaysSection.get_parent(), 'ec-weather').length === 0);
  check('secoes nativas de volta', dm._displaysSection.visible === Main.sessionMode.allowSettings);
  await Main.extensionManager.enableExtension(UUID);
  await wait(400);
  check('reativar refaz a coluna', findByClass(hbox(), 'ec-col').length === 1 && /^\d{2}\/\d{2}\/\d{4}/.test(clock()), clock());

  for (let i = 0; i < 3; i++) {
    await Main.extensionManager.disableExtension(UUID);
    await Main.extensionManager.enableExtension(UUID);
  }
  await wait(300);
  check('ciclos de ativar/desativar',
    Main.extensionManager.lookup(UUID)?.state === 1 &&
    findByClass(hbox(), 'ec-col').length === 1 && findByClass(dm, 'ec-pills').length === 1);
  L('DONE');
}

export default class EltobClockTestHarness extends Extension {
  enable() {
    run().catch(e => L('FAIL excecao', e, e.stack));
  }

  disable() {}
}
