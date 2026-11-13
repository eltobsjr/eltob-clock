# Privacidade — Eltob Clock

O Eltob Clock roda dentro do GNOME Shell, na sua sessão, e é local.

## O que fica no seu computador

- Suas preferências (formato do relógio, estilo, opções de timer e clima), guardadas pelo GSettings.
- O estado do timer e do cronômetro, só na memória enquanto a extensão está ativa. Nada é gravado em arquivo.

## Rede e localização

- **A extensão não faz chamadas de rede e não guarda a sua localização.**
- O clima vem do serviço de clima do próprio GNOME (libgweather). É o GNOME, e não esta extensão, que busca a previsão nos provedores da biblioteca, usando o local do seu clima.
- Com "localização automática" ligada nas preferências, a extensão liga a opção de localização automática do clima do GNOME (`org.gnome.shell.weather automatic-location`), que usa o GeoClue. Ela só funciona com Serviços de localização ativos em Configurações, Privacidade. Desligue a opção para a extensão não mexer nessa configuração.
- Com o cartão e a pílula de clima desligados, a extensão não lê dados de clima.

## O que a extensão não faz

- Sem telemetria, análise, relatório de falhas, contas ou sincronização na nuvem.
- Sem acesso a arquivos, contatos ou outros aplicativos além dos rótulos do relógio e do popup do GNOME que ela formata.

## Terceiros

Os botões do popup que abrem páginas (por exemplo, apoiar o autor original) só abrem quando você clica.

## Dúvidas

Abra uma issue em [github.com/eltobsjr/eltob-clock/issues](https://github.com/eltobsjr/eltob-clock/issues).
