# Eltob Clock

Relógio da barra do GNOME com **formato livre**, mais **timer**, **cronômetro** e **clima** dentro do popup do relógio. Visual da família Eltob Indicator (Catppuccin Macchiato, acento azul).

Fork do [Numeric Clock](https://github.com/nickotmazgin/Linux-Numeric-Date-And-Clock) de Nick Otmazgin (MIT). O núcleo que troca o texto do relógio vem dele; o popup, o timer, o cronômetro, o clima e o visual são novos.

![Popup do Eltob Clock](docs/popup.png)

*As capturas usam dados de exemplo no clima (gerados num GNOME 50 isolado).*

## O que faz

- **Formato livre (strftime)** no relógio da barra, com prévia ao vivo e 8 presets. Tique exato na virada do segundo.
- **Popup em 3 colunas:** notificações, calendário e clima, e uma coluna nova com a hora formatada, timer, cronômetro e ações. Os eventos e os relógios mundiais nativos ficam escondidos; ao desativar a extensão eles voltam.
- **Timer:** 5, 10, 15, 25, 30 e 60 min, com anel de progresso (verde, amarelo abaixo de 25 %, vermelho abaixo de 10 %), pausar, retomar e cancelar. Ao terminar: notificação e som do sistema.
- **Cronômetro:** iniciar, pausar, continuar e zerar.
- **Pílulas na barra** ao lado da hora: timer, cronômetro e temperatura. Só aparecem quando há o que mostrar.
- **Clima:** temperatura, condição, máx/mín, previsão por hora, sensação, vento e umidade. Usa o serviço de clima do próprio GNOME (libgweather) e a localização automática (GeoClue).
- **Ações:** copiar hora, presets de formato, estilo (Padrão, Claro, Escuro), preferências e sobre.

## Requisitos

- GNOME Shell 45 a 51 (testado no 50.6, Fedora 44, Wayland).
- Para o clima: GNOME Weather instalado e Serviços de localização ativos em Configurações, Privacidade. Ao iniciar, a extensão liga a opção "localização automática" do clima do GNOME (dá para desligar nas preferências).

## Instalar

```bash
git clone https://github.com/eltobsjr/eltob-clock.git
cd eltob-clock
./tools/build.sh
gnome-extensions install --force dist/eltob-clock@eltobsjr.gmail.com.v*.shell-extension.zip
gnome-extensions enable eltob-clock@eltobsjr.gmail.com
```

No Wayland, saia e entre na sessão para o GNOME carregar a extensão. Ela **substitui** o Numeric Clock: não deixe os dois ativos.

## Desenvolvimento

| Comando | O que faz |
|---|---|
| `./tools/build.sh` | gera o zip em `dist/` |
| `./tools/validate.sh` | confere o zip e o `metadata.json` |
| `node tools/tests/timerlogic.test.mjs` | testa a lógica do timer e do cronômetro |
| `./tools/prefs-test.sh` | testa a janela de preferências (gjs) |
| `./tools/nested-smoke-test.sh` | carrega a extensão num GNOME Shell isolado (`--headless`) e roda os testes de interface; com `EC_SHOT_DIR=/pasta` também salva capturas de tela |

Estrutura: `src/extension.js` (texto da barra e injeção no popup), `popup.js` (coluna nova), `weatherview.js` (clima), `clockstate.js` e `timerlogic.js` (timer e cronômetro), `barpills.js` (pílulas), `prefs.js` e `presets.js`.

## Privacidade

Tudo é local. Veja [PRIVACY.md](PRIVACY.md).

## Créditos e licença

MIT. Copyright (c) 2025 Nick Otmazgin (Numeric Clock, a base deste fork) e (c) 2026 Eltob. Veja [LICENSE](LICENSE).
