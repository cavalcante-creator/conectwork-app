# Conectwork · app real

Plataforma que organiza a contratação de serviços entre empresas: o **tomador** (quem contrata), a **prestadora** (empresa que presta o serviço, às vezes com equipe própria) e o **profissional** (MEI ou PJ). Duas modalidades (serviço por OS e equipe contínua) com um motor comum: aceite ou medição, espelho de faturamento, nota, validação, contas a pagar e receber e histórico.

Este repositório começa com o **kit de partida**: regras do projeto, requisitos, modelo de dados, regras de segurança do Firestore e os pedidos prontos para o Claude Code. O código é escrito pelo Claude Code, etapa por etapa.

**Situação:** Etapa 0 (base do app) pronta: login, sessão com escolha e troca de empresa, menu por permissão, componentes de tela, histórico e o módulo Início.

## O que tem aqui
| Arquivo | Para que serve |
|---|---|
| `CLAUDE.md` | Regras do projeto. O Claude Code lê sozinho antes de qualquer tarefa. |
| `PEDIDOS-CLAUDE-CODE.md` | Os pedidos prontos de cada etapa, para copiar e colar no Claude Code. |
| `docs/REQUISITOS-FASE1.md` | O que o app precisa fazer na fase 1 (piloto Colafix). |
| `docs/MODELO-DE-DADOS.md` | Coleções do Firestore, campos e quem pode ler e gravar. |
| `firestore.rules` | Regras de segurança da etapa 0 e 1 (cada empresa só vê o que é seu). |
| `config.example.js` | Modelo do `config.js` com a configuração do Firebase. |
| `docs/prototipo-referencia.html` | O protótipo, como referência de telas, textos e visual. Abra no navegador. |
| `index.html`, `css/`, `js/`, `modulos/` | O app (JavaScript puro, sem etapa de build). Estrutura no `CLAUDE.md`. |
| `manifest.webmanifest`, `sw.js`, `icons/`, `js/pwa.js` | App instalável (PWA): nome, ícones, abrir sem internet e faixa de offline. |
| `firebase.json` | Configuração dos emuladores do Firebase, usada só nos testes. |
| `testes/` | Testes automatizados (regras do Firestore e telas). |

## Passo a passo para começar
1. **Firebase** (na conta Google da Colafix, mas em um **projeto novo e separado**):
   - console.firebase.google.com › Adicionar projeto › nome `conectwork` › pode desligar o Google Analytics.
   - Na página do projeto, clique no ícone `</>` (app da Web) › apelido `conectwork-web` › copie o bloco `firebaseConfig`.
   - **Authentication** › Começar › Método de login › ative **E-mail/senha**.
   - Authentication › Configurações › **Domínios autorizados** › adicione `cavalcante-creator.github.io`.
   - **Firestore Database** › Criar banco › modo **produção** › local `southamerica-east1 (São Paulo)`.
   - Firestore › Regras › cole o conteúdo de `firestore.rules` › Publicar.
2. **GitHub**: crie o repositório `conectwork-app` e suba estes arquivos.
3. **No computador**: clone `conectwork-app` e, **na mesma pasta de cima**, o `painel-colafix` (o Claude Code vai usar o painel como referência de como fazemos as coisas):
   ```
   pastas/
     painel-colafix/
     conectwork-app/
   ```
4. Copie `config.example.js` para `config.js`, cole o `firebaseConfig` do passo 1 e suba o `config.js` junto (ele precisa estar no repositório para o site funcionar; isso é normal no Firebase, igual ao painel da Colafix).
5. Abra o Claude Code dentro de `conectwork-app` e cole o **Pedido 1** de `PEDIDOS-CLAUDE-CODE.md`.
6. Depois que a Iasmyn criar o login dela no app, pegue o **UID** dela em Authentication › Usuários e crie no Firestore o documento `master/<UID>` com o campo `nome: "Iasmyn"`. É isso que dá o acesso de equipe Conectwork.

## Publicar
GitHub Pages: Settings › Pages › Deploy from a branch › `main` › `/ (root)`. O app fica em `https://cavalcante-creator.github.io/conectwork-app/`.
O protótipo continua separado, no repositório `conectwork`.

**A cada publicação, troque a `VERSAO` no começo do `sw.js`** (ex.: `conectwork-v1` → `conectwork-v2`). É assim que os aparelhos percebem que há versão nova: o navegador instala a nova e apaga os arquivos guardados da anterior. Se esquecer, quem já usa o app continua recebendo os arquivos novos quando estiver com internet (o app busca na rede primeiro), mas o cache antigo não é limpo.
Se criar um arquivo novo em `js/` ou `modulos/`, acrescente também na lista `ARQUIVOS` do `sw.js`, para ele abrir sem internet.

## Instalar no celular e no computador
O Conectwork pode ser instalado como app, com ícone próprio e sem a barra do navegador. Abra o endereço do app e:
- **Android (Chrome):** menu ⋮ › **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** botão **Compartilhar** › **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** clique no **ícone de instalar** na barra de endereço, à direita.

Sem internet, o app abre com o visual completo e avisa que precisa da conexão para entrar. Enquanto a conexão estiver caída aparece a faixa "Você está offline. Nada é enviado ao servidor até a conexão voltar.". Login e dados (Firebase) nunca ficam guardados no aparelho pelo app.

## Testes
Os testes ficam em `testes/` e não vão para o site (o GitHub Pages só serve os arquivos; `node_modules` fica fora do repositório).

**Precisa ter instalado:**
- **Node.js 18 ou mais novo** (nodejs.org).
- **Java 11 ou mais novo**, só para o teste das regras (o emulador do Firestore roda em Java). No Windows: `winget install EclipseAdoptium.Temurin.21.JRE`.

**Primeira vez** (dentro da pasta `testes`):
```
cd testes
npm install
npx playwright install chromium
```

**Rodar:**
| Comando (dentro de `testes/`) | O que testa |
|---|---|
| `npm run telas` | Telas com o Firebase simulado (sem internet): componentes (`teste-ui.js`), login (`teste-login.js`) sessão, menu e permissões (`teste-sessao.js`), cadastro de empresa do começo ao fim (`teste-cadastro.js`), análise dos cadastros pela equipe Conectwork (`teste-analise.js`), usuários, acessos e convites (`teste-usuarios.js`) e app instalável (`teste-pwa.js`: manifest, service worker, abrir sem internet, faixa de offline e troca de `VERSAO`; este usa um servidor local, porque o service worker só roda em `localhost` ou https). |
| `npm run regras` | Regras do `firestore.rules` no emulador do Firestore (`teste-regras.js`). Liga o emulador, roda e desliga sozinho. |
| `npm test` | Os dois acima. |

Cada linha da saída diz `PASSOU` ou `FALHOU` e o que foi conferido; no fim aparece o placar (ex.: `46 de 46 testes de regras passaram.`). O detalhe fica em `testes/resultado-*.json`.

Para testar um arquivo só: `node teste-login.js` (telas) ou `npx firebase emulators:exec --only firestore --project demo-conectwork "node teste-regras.js"` (regras).

**Regra do projeto:** toda mudança de coleção ou campo atualiza o `firestore.rules` **e** o `teste-regras.js`.

## Rodar o app no computador
Qualquer servidor de arquivos serve (não tem etapa de build). Na pasta do projeto:
```
npx http-server -p 5500 -c-1
```
e abra `http://localhost:5500`. Isso usa o Firebase de verdade do `config.js`.
Para usar os emuladores locais em vez do Firebase de verdade (nada é gravado no projeto real): em outro terminal, de dentro de `testes/`, rode `npx firebase emulators:start --only auth,firestore --project conectwork-4c285` e abra `http://localhost:5500/?emulador=1`. Sem mexer no `config.js`.
