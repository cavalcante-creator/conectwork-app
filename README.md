# Conectwork · app real

Plataforma que liga quem contrata (indústria), quem fornece profissionais (intermediária) e quem presta o serviço (MEI): pedido de nota, conferência, pagamento e histórico.

Este repositório começa com o **kit de partida**: regras do projeto, requisitos, modelo de dados, regras de segurança do Firestore e os pedidos prontos para o Claude Code. O código é escrito pelo Claude Code, etapa por etapa.

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
