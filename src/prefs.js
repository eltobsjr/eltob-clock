// SPDX-License-Identifier: MIT
// Eltob Clock prefs — GNOME 45+ (ESM)
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
  FORMAT_PRESETS, MAX_FORMAT_LENGTH, applyPresetToSettings,
  formatNow, formatShowsSeconds, isValidFormat,
} from './presets.js';

const REPO_URL = 'https://github.com/eltobsjr/eltob-clock';
const UPSTREAM_URL = 'https://github.com/nickotmazgin/Linux-Numeric-Date-And-Clock';
const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=4HM44VH47LSMW';
const AUTHOR = 'Nick Otmazgin (original), fork de Eltob';
const SETTING_KEYS = [
  'format-string', 'update-interval', 'only-topbar', 'smooth-second', 'menu-style',
  'bar-pills', 'timer-sound', 'weather-enabled', 'weather-auto-location', 'weather-bar-pill',
];
const CHEATSHEET = [
  ['%d / %m / %Y', 'Day · month · year (22 / 10 / 2026)'],
  ['%H : %M : %S', '24-hour time (13:05:09)'],
  ['%I %p', '12-hour clock with AM/PM'],
  ['%a / %A', 'Short / full weekday'],
  ['%b / %B', 'Short / full month name'],
  ['%V / %j', 'ISO week number / day of year'],
  ['%e / %-d', 'Day without leading zero'],
  ['%Z', 'Time zone abbreviation'],
];

function launchUri(uri) {
  try { Gio.AppInfo.launch_default_for_uri(uri, null); } catch (_e) {}
}

function switchRow(settings, key, title, subtitle) {
  const row = new Adw.SwitchRow({ title, subtitle });
  settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

// Combo row for a string key with <choices>; choices are [value, label] pairs.
function comboRow(settings, key, title, subtitle, choices) {
  const row = new Adw.ComboRow({
    title, subtitle,
    model: Gtk.StringList.new(choices.map(([, label]) => _(label))),
  });
  const sync = () => {
    const i = choices.findIndex(([value]) => value === settings.get_string(key));
    if (i >= 0 && row.selected !== i) row.selected = i;
  };
  sync();
  row.connect('notify::selected', () => settings.set_string(key, choices[row.selected][0]));
  const id = settings.connect(`changed::${key}`, sync);
  row.connect('destroy', () => settings.disconnect(id));
  return row;
}

export default class EltobClockPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const metadata = this.metadata || {};
    window.default_width = 600;
    window.default_height = 680;
    window.search_enabled = true;

    // ── Settings page ───────────────────────────────────────────────
    const pageSettings = new Adw.PreferencesPage({
      title: _('Opções'),
      icon_name: 'preferences-system-symbolic',
    });

    const groupFormat = new Adw.PreferencesGroup({
      title: _('Formato do relógio'),
      description: _('Usa o idioma e o fuso do sistema'),
    });

    // Edits are saved only on Enter or the apply button, so a stray key press
    // (Preferences can open straight from a panel click) never changes the clock.
    const rowFmt = new Adw.EntryRow({ title: _('Formato (strftime)'), show_apply_button: true });
    const showSaved = () => {
      // Setting text programmatically would otherwise reveal the apply button.
      rowFmt.show_apply_button = false;
      rowFmt.text = settings.get_string('format-string');
      rowFmt.show_apply_button = true;
    };
    showSaved();
    groupFormat.add(rowFmt);

    const rowPreview = new Adw.ActionRow({ title: _('Prévia') });
    const preview = new Gtk.Label({ selectable: true, hexpand: true, xalign: 1, wrap: true, css_classes: ['numeric'] });
    rowPreview.add_suffix(preview);
    groupFormat.add(rowPreview);

    // Live sample shown as each preset row's subtitle.
    const presetRows = [];
    let previewTimer = 0;
    // The preview follows what is typed; the clock changes once it is applied.
    const refreshPreview = () => {
      const fmt = rowFmt.text;
      const valid = isValidFormat(fmt);
      preview.label = formatNow(fmt);
      if (!valid)
        rowPreview.subtitle = _('Formato inválido ou vazio — não será salvo');
      else if (!fmt.includes('%'))
        rowPreview.subtitle = _('Sem códigos % — o relógio mostraria este texto como está');
      else if (fmt !== settings.get_string('format-string'))
        rowPreview.subtitle = _('Enter ou ✓ para aplicar');
      else
        rowPreview.subtitle = _('Amostra ao vivo');
      if (valid && fmt.includes('%')) rowFmt.remove_css_class('error');
      else rowFmt.add_css_class('error');
      for (const [row, preset] of presetRows)
        row.subtitle = `${preset.fmt}  →  ${formatNow(preset.fmt)}`;
    };
    const restartPreviewTimer = () => {
      if (previewTimer) GLib.source_remove(previewTimer);
      const fmt = settings.get_string('format-string');
      const sec = formatShowsSeconds(fmt) ? 1 : Math.min(60, Math.max(1, settings.get_int('update-interval')));
      previewTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, sec, () => {
        refreshPreview();
        return GLib.SOURCE_CONTINUE;
      });
      refreshPreview();
    };

    const cheatsheet = new Adw.ExpanderRow({
      title: _('Códigos de formato'),
      subtitle: _('Códigos strftime comuns — combine à vontade'),
    });
    for (const [code, meaning] of CHEATSHEET) {
      const row = new Adw.ActionRow({ title: code, subtitle: _(meaning) });
      row.add_css_class('property');
      cheatsheet.add_row(row);
    }
    groupFormat.add(cheatsheet);
    pageSettings.add(groupFormat);

    const groupBehavior = new Adw.PreferencesGroup({ title: _('Comportamento') });
    const rowInt = new Adw.SpinRow({
      title: _('Intervalo de atualização (segundos)'),
      subtitle: _('Use 1 quando o formato mostra segundos'),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 300, step_increment: 1, page_increment: 5 }),
      numeric: true,
    });
    settings.bind('update-interval', rowInt, 'value', Gio.SettingsBindFlags.DEFAULT);
    groupBehavior.add(rowInt);
    groupBehavior.add(switchRow(settings, 'smooth-second',
      _('Tique exato'),
      _('Atualiza exatamente na virada de cada segundo')));
    groupBehavior.add(switchRow(settings, 'only-topbar',
      _('Mudar só o relógio da barra'),
      _('Recomendado. Desligado, relógios de outros painéis e docks também são formatados.')));
    pageSettings.add(groupBehavior);

    const groupLook = new Adw.PreferencesGroup({ title: _('Aparência') });
    groupLook.add(comboRow(settings, 'menu-style', _('Estilo do popup'),
      _('Cores dos nossos cartões. Padrão = paleta Eltob (Macchiato).'),
      [['system', 'Padrão'], ['light', 'Claro'], ['dark', 'Escuro']]));
    pageSettings.add(groupLook);

    const groupTimer = new Adw.PreferencesGroup({ title: _('Timer e cronômetro') });
    groupTimer.add(switchRow(settings, 'bar-pills',
      _('Pílulas na barra'),
      _('Mostra o timer e o cronômetro ao lado do relógio enquanto estiverem ativos')));
    groupTimer.add(switchRow(settings, 'timer-sound',
      _('Som ao terminar'),
      _('Toca o som "complete" do sistema, além da notificação')));
    pageSettings.add(groupTimer);

    const groupWeather = new Adw.PreferencesGroup({
      title: _('Clima'),
      description: _('Usa o serviço de clima do próprio GNOME (libgweather). A extensão não faz chamadas de rede nem guarda a sua localização.'),
    });
    groupWeather.add(switchRow(settings, 'weather-enabled',
      _('Cartão de clima no popup'),
      _('Temperatura, previsão por hora, sensação, vento e umidade')));
    groupWeather.add(switchRow(settings, 'weather-auto-location',
      _('Localização automática'),
      _('Liga a localização automática do clima do GNOME (GeoClue). Exige Serviços de localização ativos em Configurações, Privacidade.')));
    groupWeather.add(switchRow(settings, 'weather-bar-pill',
      _('Temperatura na barra'),
      _('Pílula com o ícone e a temperatura ao lado do relógio')));
    pageSettings.add(groupWeather);

    const groupPresets = new Adw.PreferencesGroup({
      title: _('Presets de formato'),
      description: _('Formatos de um clique — a amostra usa o idioma e o fuso do sistema'),
    });
    for (const preset of FORMAT_PRESETS) {
      const row = new Adw.ActionRow({ title: _(preset.label) });
      row.add_css_class('property');
      const btn = new Gtk.Button({ label: _('Aplicar'), valign: Gtk.Align.CENTER });
      btn.connect('clicked', () => applyPresetToSettings(settings, preset));
      row.add_suffix(btn);
      row.activatable_widget = btn;
      groupPresets.add(row);
      presetRows.push([row, preset]);
    }
    pageSettings.add(groupPresets);

    const groupReset = new Adw.PreferencesGroup();
    const rowReset = new Adw.ActionRow({
      title: _('Restaurar padrões'),
      subtitle: _('Volta todas as opções desta página ao padrão'),
    });
    const btnReset = new Gtk.Button({
      label: _('Restaurar'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action'],
    });
    btnReset.connect('clicked', () => {
      for (const key of SETTING_KEYS)
        settings.reset(key);
    });
    rowReset.add_suffix(btnReset);
    rowReset.activatable_widget = btnReset;
    groupReset.add(rowReset);
    pageSettings.add(groupReset);

    // ── About page ──────────────────────────────────────────────────
    const pageAbout = new Adw.PreferencesPage({
      title: _('Sobre'),
      icon_name: 'help-about-symbolic',
    });

    const groupInfo = new Adw.PreferencesGroup({ title: _('Extensão') });
    const infoRow = (title, subtitle) => {
      const row = new Adw.ActionRow({ title, subtitle, subtitle_selectable: true });
      row.add_css_class('property');
      groupInfo.add(row);
    };
    infoRow(_('Nome'), metadata.name || 'Eltob Clock');
    infoRow(_('Versão'), metadata['version-name'] || String(metadata.version ?? ''));
    infoRow(_('Desenvolvedor'), AUTHOR);
    infoRow(_('Descrição'),
      _('Relógio da barra com formato livre, timer, cronômetro e clima no popup. Fork do Numeric Clock.'));
    pageAbout.add(groupInfo);

    const groupLinks = new Adw.PreferencesGroup({ title: _('Links') });
    const addLinkRow = (title, uri, icon = 'go-next-symbolic') => {
      const row = new Adw.ActionRow({ title, activatable: true });
      row.add_suffix(new Gtk.Image({ icon_name: icon }));
      row.connect('activated', () => launchUri(uri));
      groupLinks.add(row);
    };
    addLinkRow(_('Repositório do Eltob Clock'), REPO_URL);
    addLinkRow(_('Reportar um problema'), `${REPO_URL}/issues`);
    addLinkRow(_('Numeric Clock original (Nick Otmazgin)'), UPSTREAM_URL);
    addLinkRow(_('Apoiar o autor original (PayPal)'), DONATE_URL);
    pageAbout.add(groupLinks);

    window.add(pageSettings);
    window.add(pageAbout);
    // O botão "Sobre" do popup pede a página Sobre.
    if (settings.get_string('prefs-page') === 'about') {
      window.set_visible_page(pageAbout);
      settings.reset('prefs-page');
    }

    rowFmt.connect('changed', () => {
      if (rowFmt.text.length > MAX_FORMAT_LENGTH)
        rowFmt.text = rowFmt.text.slice(0, MAX_FORMAT_LENGTH);
      refreshPreview();
    });
    rowFmt.connect('apply', () => {
      const fmt = rowFmt.text.trim();
      if (isValidFormat(fmt) && fmt.includes('%'))
        settings.set_string('format-string', fmt);
      else
        refreshPreview();
    });
    // Open with nothing focused, so typing does not land in the format field.
    window.connect('map', () => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      window.set_focus(null);
      return GLib.SOURCE_REMOVE;
    }));
    const settingsIds = [
      settings.connect('changed::format-string', () => {
        showSaved();
        restartPreviewTimer();
      }),
      settings.connect('changed::update-interval', restartPreviewTimer),
    ];
    restartPreviewTimer();

    // The prefs process outlives the window; stop the timer and signals with it.
    window.connect('close-request', () => {
      if (previewTimer) GLib.source_remove(previewTimer);
      previewTimer = 0;
      for (const id of settingsIds)
        settings.disconnect(id);
      return false;
    });
  }
}
