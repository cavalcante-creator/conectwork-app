# CLAUDE.md · Conectwork

Leia este arquivo inteiro antes de qualquer tarefa. Ele vale mais do que qualquer suposição.

## O que é
Plataforma que organiza a contratação de serviços entre empresas: **tomador** (quem contrata, ex.: Colafix), **prestadora** (empresa que presta o serviço, às vezes com equipe própria, ex.: Zenith, Nexus) e **profissional** (MEI ou PJ). Organiza contratação, comprovação da entrega, nota fiscal, contas a pagar e receber e reputação. Fase 1 = piloto na Colafix.

## Duas modalidades, um motor comum
Toda contratação passa por uma **triagem** e segue uma de duas modalidades:
1. **Serviço por OS** (entrega identificável): demanda → propostas → contrato e ordem de serviço (OS) com assinatura → execução → entrega → aceite (total, parcial ou divergência).
2. **Equipe contínua** (terceirização por prestadora com equipe e supervisor próprios): contrato com a prestadora → **medição do período** (pode vir do painel do RH da Colafix) → aprovação da medição. Exige controles extras: certidões da prestadora em dia, documentos de segurança e interlocutor da prestadora.

As duas usam o **mesmo motor**: aceite ou medição aprovada → **espelho de faturamento** → envio da nota → **validação tripla** (contrato/OS + aceite/medição + nota) → **título** em contas a pagar e receber → pagamento → avaliação e histórico.

## Regras do modelo de negócio
- **Receita = mensalidade** de tomadores (planos Essencial, Profissional, Rede) e de empresas parceiras do clube de ofertas. **Sem comissão sobre os serviços.** Cadastro do profissional é gratuito.
- **O dinheiro não passa pelo Conectwork:** sai do tomador direto para o prestador. O app registra, agenda, concilia e mostra o comprovante.
- **"Agendado" não é "pago".** Só baixa com liquidação confirmada.
- **Vencimento** vem do contrato e não pode ser adiado por um lado só.
- **Uma nota não gera dois títulos.** Nota divergente não pode ser paga. Troca de conta bancária exige revisão reforçada.
- **Funções separadas no tomador:** solicitante, aprovador técnico, responsável fiscal e tesouraria. Quem pede não aprova o pagamento sozinho.
- **Avaliação:** no serviço por OS, depois do aceite, recíproca, visível quando os dois avaliarem ou após 7 dias. Na equipe contínua, o tomador avalia o **serviço da prestadora**; quem avalia o profissional é a **prestadora**, a cada serviço pago. Recusar oportunidade nunca reduz reputação. Nota baixa não desativa ninguém automaticamente.
- **Triagem:** perguntas sobre entrega x posto, chefia direta, jornada controlada, exclusividade e relação nos últimos 18 meses (Lei 6.019, arts. 5º-C e 5º-D). Resultado: "compatível", "requer análise jurídica" ou "não publicar neste modelo". É controle preventivo, não certificado jurídico.

## Como o projeto é feito (igual ao painel da Colafix)
- JavaScript puro, **sem etapa de build**, publicado no **GitHub Pages**.
- **Firebase**: Authentication (e-mail e senha, Google e Microsoft) e Firestore. Projeto `conectwork`, **separado** do projeto do painel da Colafix.
- Use o repositório irmão `../painel-colafix` como **referência de padrão**: como os módulos são registrados, como o login é tratado, como os testes são feitos. Copie o jeito, não copie dados nem regras de negócio da Colafix.
- Visual e textos: siga `docs/prototipo-referencia.html` (cores, componentes, modo claro e escuro), com o visual corporativo da versão 3 (abaixo). **Tema escuro é o padrão** (07/11/2026); a pessoa troca no botão do topo: escuro → claro → automático. O protótipo é a referência visual e de fluxo; o código dele é só ilustrativo e **não** deve ser copiado como base (ele guarda tudo em localStorage).

## Estrutura de pastas
```
index.html            casca do app (layout, menu, carregamento)
config.js             configuração do Firebase (vai para o repositório: o GitHub Pages precisa dele; a segurança vem das regras)
css/app.css           estilos (tokens de cor do protótipo, claro e escuro)
js/firebase.js        inicialização do Firebase e helpers de banco
js/sessao.js          login, logout, troca de empresa, usuário e acesso atuais
js/permissoes.js      cargos, módulos por empresa, ajuste por pessoa
js/app.js             roteamento por hash (#modulo/tela), menu, registro de módulos
js/ui.js              componentes: toast, diálogo, painel lateral, tabelas, formulários, máscaras
js/log.js             registro no histórico de alterações
modulos/<nome>.js     um arquivo por módulo, registrado com CW.registrarModulo({...})
modulos/lista.js      lista dos módulos carregados
firestore.rules       regras de segurança
testes/               testes automatizados
```

## Identidade e comunicação
- Na interface aparece **só o nome Conectwork**. Nunca usar marcas de terceiros em telas, textos ou dados de exemplo (os dados reais das empresas do piloto existem só no banco de produção). Única exceção: os botões de login "Google" e "Microsoft", com o símbolo de cada um (padrão exigido por eles).
- **Marca (identidade aprovada em 07/11/2026):** símbolo = faixa azul em losango arredondado com a folha verde-água (`CW.ui.LOGO`, `icons/simbolo.svg`); "Conect" em branco ou azul-marinho e "work" em azul. Cores: azul `#1A5CF0`, azul-marinho `#0B1A45`/`#081638`, verde-água `#22D3A6`, cinza-claro `#E8ECF5`.
- Frase da marca na tela de entrar (imagem aprovada em 09/11/2026): "Conectando empresas. Simplificando negócios." (a frase antiga "Conectando empresas, pessoas e oportunidades." ainda aparece na abertura e no manifest). Mensagem principal: "Contrate serviços com mais organização, rastreabilidade e gestão de riscos."
- **Tela de entrar (09/11/2026, imagem da usuária):** fundo azul-marinho com faixas diagonais azul/ciano nos cantos e uma linha contínua (`CW.ui.FUNDO`; `CURVES` continua no menu e no cadastro); marca grande, traço ciano, frase em duas linhas, benefícios com ícone em moldura (`handshake`, `chart`, `shield`), selos; cartão azul (#10275A) com borda clara, igual nos temas claro e escuro, ícones nos rótulos, "Entrar" em degradê #1769FF → #12C7E8, Google/Microsoft com contorno, cadastro e convite separados por um traço. Paleta de referência: #081936, #12366D, #1769FF, #12C7E8, #A8B8D0. Estilos no bloco "identidade de 09/11/2026" do `css/app.css`.
- Nunca prometer "sem risco trabalhista", "blindagem" ou garantia contra processos. Aviso padrão: "O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada."
- **Consentimentos separados** (operacional, contrato, cobrança, cursos, ofertas, WhatsApp, e-mail, push). Cursos e ofertas **desmarcados por padrão**; registrar texto, versão, data, finalidade, canal e revogação.

## Regras de ouro
1. **Cada empresa só vê o que é dela.** Todo documento tem `empresaId` (ou `partes` quando envolve duas empresas). A segurança vem do `firestore.rules`, nunca só da tela. Toda mudança de coleção ou campo atualiza as regras **e** os testes das regras.
2. **Permissão em dois níveis:** módulos ligados por empresa (equipe Conectwork) e cargo por pessoa (administrador da empresa), com ajuste individual (`extras` e `sem`), no mesmo modelo de `acessos` do painel da Colafix.
3. **Toda ação que muda dados grava no histórico** (`log`), com quem, quando, empresa e o que foi feito. O histórico não pode ser editado nem apagado.
4. **Nada de segredo no front.** Certificado digital, chaves de API de WhatsApp, banco ou NFS-e só no servidor (Cloud Functions, em etapa futura). Se uma tarefa exigir isso, pare e avise.
5. **Linguagem e comportamento de relação empresarial.** Prestador é **profissional** ou **prestador**, nunca "funcionário". Fim de contrato é **encerramento do serviço**, nunca "demissão". Pagamento é **pagamento da nota**, nunca "salário". O app **não** terá controle de ponto de PJ, localização contínua, obrigação de ficar conectado, punição por recusa nem ordens disciplinares. Não negocie esta regra.
6. **Textos em português do Brasil**, simples, sem jargão. Erros dizem o que aconteceu e o que fazer.
7. **Validações reais:** CNPJ e CPF por dígito verificador, e-mail, celular com DDD, datas.
8. **LGPD:** só guarde o necessário. Dados bancários e documentos ficam em área privada da empresa. Nada de dados pessoais em logs além de nome e e-mail.
9. **Sem dados fictícios em produção.** Dados de exemplo só no ambiente `teste`.
10. **Testes antes de subir:** cada pedido termina com os testes passando e a lista do que foi testado.

## Pré-cadastro pela equipe Conectwork (09/11/2026)
- Em **Cadastros** (equipe master), "Pré-cadastrar empresa": só CNPJ (validado e reservado em `cnpjs/`), nome, uso e plano. A empresa nasce `status:'aprovado'` com `preCadastro:true`, os módulos do plano, protocolo e `privado/cadastro` vazio; marcando "me colocar como administrador(a)", cria `acessos/{empresa}_{uid}` admin para quem cadastrou, que entra na empresa e configura tudo (convida as pessoas com o e-mail delas quando tiver).
- Na lista aparece "Documentos pendentes"; na análise, "Pedir para a empresa completar o cadastro" (vira `pendencia`; a empresa preenche em "Meu cadastro" e reenvia; aprovar de novo grava `preCadastro:false`).
- **Porte** (10/11/2026): o pré-cadastro pergunta o porte (`privado/cadastro.dados.porte`; MEI marca "Só presta serviços"). MEI que só presta abre no menu simples do profissional (`porteMei()` em `js/app.js`). Na análise de uma empresa pré-cadastrada aprovada, a equipe muda **uso e porte** junto com plano e módulos (`#cm-tipo`, `#cm-porte`, histórico `empresa.plano`) e o cache `cw.porte.<id>` é limpo. Testes P9 e P10.
- **Quem só presta não abre OS** (10/11/2026): `soPresta(ctx)`/`podePedir(ctx)` em `modulos/ordens.js` escondem "Nova ordem de serviço" (e o "Nova OS" do contrato) para empresa `tipo:'prestador'`; a tela vazia explica que a OS vem da empresa que contrata (`#os-vazio-presta`). O mesmo vale para contratos: sem "Novo contrato" para quem só presta (`soPresta` em `modulos/contratos.js`) e **regra** em `contratos` create: o tomador não pode ser `tipo 'prestador'` (`teste-regras.js`, `teste-autorizacoes.js` M1c). No menu simples do MEI, Ordens de serviço se chama **Demandas** (`NOMES_MEI`, também no título da tela). Teste: `teste-autorizacoes.js` M1b.
- Regra: `empresas` create aceita, só para `master()`, `status 'aprovado'` com `preCadastro == true`, plano, módulos e avaliação. Testes: `teste-precadastro.js` e `teste-regras.js`.

## Links dos e-mails (09/11/2026)
- O link dos e-mails do Firebase aponta para o app (Authentication › Modelos › Personalizar URL de ação = endereço do app). `js/sessao.js` (`lerAcao`/`telaAcao`) lê `?mode=…&oobCode=…` e mostra, no visual da entrada: **Crie uma senha nova** (`verifyPasswordResetCode` → `confirmPasswordReset`, depois já entra), **E-mail confirmado** (`applyActionCode`), **E-mail de acesso devolvido** (`checkActionCode` + `applyActionCode`) e **Link fora da validade** ("Pedir um link novo"). O código sai do endereço depois. Modelos de e-mail em `docs/emails/` (HTML para colar no console, com `%LINK%`/`%EMAIL%`) e o passo a passo em `docs/emails/COMO-CONFIGURAR.md`. Teste: `teste-linkemail.js`.

## Organização das telas (09/11/2026, "pode fazer tudo")
- Só organização, cores e letra de antes (o visual novo das telas internas foi desfeito a pedido; o verde saiu: `--cyan #4D93FF`, iniciais em azul).
- **Menu em grupos** (`GRUPO`/`menuHtml` em `js/app.js`): Contratação · Financeiro · Empresa (equipe: Rede · Equipe), títulos `.navgrupo`; ícones diferentes (Ordens `clipboard`, Medições `ruler`, Relatórios `chart`, Documentos `folder`). **Empresa no topo do menu** (`.empbloco`, botão `#trocar-empresa`); no celular o botão continua na barra de cima (`#trocar-empresa-top`).
- **Início** (`modulos/inicio.js`): números do dia (`#ini-nums`, pendências por tela, toque abre a tela), "Precisa de você" com **3+ pendências do mesmo módulo num item só** (`details.pv-g`, "N documentos para enviar"/"N pendências em …", abre a lista) e, ao lado, o cartão da pessoa (`#ini-quem`: nome, empresa, cargo, situação, Minhas autorizações). Saíram o cartão grande do nome e "Telas liberadas".
- **Telas vazias com os passos** (`CW.ui.passos([...])`): Pagar e receber, Espelhos, Medições, Contratos, Ordens de serviço.
- (o limite de 1280px saiu em 09/11, ver "Topo à direita e tela cheia"); `main#view>*` sem margem própria (a tela já separa os blocos com 22px; antes dobrava).
- Testes que leem o "Precisa de você" usam `textContent` e `state:'attached'` (itens agrupados ficam fechados). `teste-pendencias.js` (P1b, P1c).

## Visual corporativo · versão 3 (escolhida em 09/11/2026 entre três versões do Início)
- Letra: **Red Hat Display** (títulos e números, `--fd`) e **Red Hat Text** (texto, `--ft`), no app inteiro, inclusive na entrada e na abertura (a Sora saiu).
- Bloco "Visual corporativo · versão 3" no fim do `css/app.css`: menu `--side #0B1A3A` com a marca numa faixa de 64px mais escura (`--side2`), item aberto com borda azul à esquerda, contadores vermelhos quadrados; barra branca de 64px no alto (`--barra`); título com a linha pequena em cima (`#eyebrow`: a data no Início, o grupo nas outras telas); fundo `#F1F3F7`; cartões brancos com borda fina e cantos de 10px; botões, selos e campos com cantos de 8/4px; cabeçalho de tabela em maiúsculas. Escuro: `#0A1226`/`#111C36`.
- Início: números com faixa de cor em cima (amarelo = tem pendência, cinza = nada pendente) e **Próximos vencimentos** (`#ini-venc`, `CW.titulos.proximos(ctx, n)`: os títulos que Pagar e receber já carrega, sem leitura nova; tocar abre o título).
- A tela de entrar continua como aprovada (Entrar em degradê; regra `.login #lg .btn.lg-principal`).
- **Tema escuro = versão 2 "escura premium"** (09/11: "gostei da 2 também" → escuro 2, claro 3): bloco no fim do `css/app.css`, as mesmas regras com `:root[data-theme="dark"]` e com `@media (prefers-color-scheme:dark) :root:not([data-theme="light"])`. Fundo `#071533` com brilho azul e faixa diagonal, cartões translúcidos `rgba(16,39,90,.55)` com borda clara e cantos de 18px, menu com item aberto em pílula, ícones em moldura, botão em degradê azul (sem ciano), o número do Início com mais pendências em destaque azul (`.ini-num.dest`, marcado em `numeros()` no `modulos/inicio.js`). Ao mexer numa peça, ajuste os dois temas.

## Topo à direita e tela cheia (09/11/2026)
- No computador (≥901px) a empresa (`.empbloco`, com `#trocar-empresa`), o botão de tema e o cartão da pessoa (`.usercard`: nome, cargo, Minhas autorizações e **Sair**) ficam no canto de cima, à direita (`#topo-dir` na `.appbar`); `posicionarTopo()` em `js/app.js` move os elementos (os mesmos ids) entre o topo e o menu do celular quando a largura muda. No celular continua tudo no menu de cima.
- O conteúdo ocupa a largura toda (sem o limite de 1280px); a partir de 1400px, letra 15px, menu de 260px, títulos e números maiores e a coluna da direita do Início com 400px.

## Domínio próprio (09/11/2026)
- O app está em **https://conectwork.com.br/** (arquivo `CNAME`; DNS no Registro.br: 4 entradas A 185.199.108.153/109/110/111 e CNAME `www` → `cavalcante-creator.github.io`). `config.js` `urlApp` = `https://conectwork.com.br/` (links de convite, e-mails de confirmação e de senha nova). O endereço antigo do GitHub redireciona para o novo.
- No Firebase: domínios autorizados `conectwork.com.br` e `www.conectwork.com.br`; URL de ação dos modelos = `https://conectwork.com.br/`.
- **Prévia do link** (WhatsApp, LinkedIn, e-mail): etiquetas `og:*` e `twitter:*` no `index.html` com a imagem `icons/og-conectwork.jpg` (1200×630, visual da tela de entrar, ~65 KB) e a frase da marca. Mudou a imagem? Troque o nome do arquivo, porque o WhatsApp guarda a prévia antiga.

## Cargos (dentro de cada empresa)
| Cargo | O que vê |
|---|---|
| admin | Tudo da empresa; convida pessoas, define cargos, ajusta acessos |
| financeiro | Pagar, receber, relatórios, conta, dados da empresa |
| rh | Fechamentos, integração, relatórios, catálogo |
| operacional | Notas a emitir, profissionais, catálogo |
| solicitante | Abre demandas e acompanha contratos; não aprova pagamento |
| aprovador | Aprovador técnico: aprova entregas e medições; não libera pagamento |
| tesouraria | Agenda pagamentos liberados e confirma a liquidação |
| contador | Só leitura: cobranças e relatórios |
| consulta | Só leitura das telas liberadas |
A **equipe Conectwork** (master) não é cargo: é quem tem o documento `master/{uid}`.

## Como entregar cada pedido
- Trabalhe numa etapa por vez, como está em `PEDIDOS-CLAUDE-CODE.md`.
- **Combinado com a usuária (07/11/2026):** com os testes passando, pode subir direto para a `main` (além do branch de trabalho), sem pedir de novo.
- Ao terminar: resumo do que mudou, arquivos criados ou alterados, testes feitos, e o que a pessoa precisa fazer no console do Firebase (se houver).
- Se algo do pedido conflitar com este arquivo, este arquivo vence. Pergunte antes de inventar regra de negócio.

## Login com Microsoft desligado (09/11/2026)
- O botão Microsoft só aparece com `loginMicrosoft: true` no `config.js` (hoje `false`): a conta pessoal da usuária não registra apps no Azure sem assinatura. Para ligar: criar a conta gratuita do Azure, registrar o app (README › Login com Google e Microsoft), colar ID e segredo no Firebase e trocar para `true`. Os testes ligam a chave pelo `harness.js` (`H.abrir({ microsoft:false })` testa desligado; `teste-social.js` S9).

## Meus dados e busca do topo (09/11/2026)
- **Meus dados** (`modulos/meusdados.js`, `#meusdados`, fora do menu): abre tocando no nome (`#meus-dados`, no topo ou na barra do celular) e pela busca. Nome e celular (`usuarios/{uid}`), **trocar o e-mail de acesso** (pede a senha atual: `reauthenticateWithCredential` → `verifyBeforeUpdateEmail(novo, {url: urlApp})`; o e-mail só muda quando a pessoa abre o link no e-mail novo, tela "E-mail confirmado" do `sessao.js`; aviso "Falta abrir o link" em `sessionStorage cw.emailNovo.<uid>`), **trocar a senha** (link por e-mail). Quem entra só pelo Google/Microsoft vê que o e-mail é o da conta e não troca.
- `CW.meusDados.sincronizar(st)` roda depois de cada login: se o e-mail de acesso ou o nome mudou, acerta `usuarios/{uid}` e os acessos ativos (nome e e-mail que o admin vê). Histórico (`pessoa.email`, `pessoa.nome`) só quando muda de verdade; acesso antigo sem nome/e-mail só é completado. **Regra:** a pessoa pode mudar no próprio acesso só `nome`, `email` (= o do login) e `atualizadoEm` (`teste-regras.js`).
- **Busca do topo** (`buscar()` em `js/app.js`): botão `#busca-abrir` na barra de cima (≥901px), lupa `#busca-cel` no celular, **Ctrl+K** ou **/**. Procura telas, empresas para trocar e os dados que as telas já carregaram, sem leitura nova: cada módulo pode ter `buscar(ctx) → [{ t, s, rota, txt }]` (hoje contratos, medições, espelhos/notas, pagar e receber e ordens). Todas as palavras precisam aparecer, sem acento; números também casam só pelos dígitos. ↑ ↓ Enter, Esc fecha. Teste: `teste-meusdados.js`.
- **Remetente próprio dos e-mails:** passo a passo em `docs/emails/REMETENTE-PROPRIO.md` (Firebase › Modelos › Personalizar domínio + entradas TXT/CNAME no Registro.br).

## Logos com encaixe automático (10/11/2026)
- `CW.logos.organizar(url)` (`modulos/logos.js`) prepara cada logo antes de mostrar, num quadradinho de 160 px: corta a margem vazia (transparente ou da cor do fundo), usa a cor de fundo da própria logo, trata **selo** (retângulo de uma cor dentro de uma margem, ex.: fundo preto com o nome em branco; até 3 camadas: margem transparente › placa › selo) pintando o quadradinho todo na cor do selo, põe azul-marinho atrás de logo branca sobre transparente e deixa margem de 8% (letreiro comprido) a 14% (logo quadrada). Avatar escuro ganha `.logo-escura` (sem borda). Vale para as logos já guardadas: o banco não muda. Teste: `teste-logos.js`.

## Perfil MEI: Agenda e lembretes · Assistente (10/11/2026)
- O diferencial do Conectwork é o perfil MEI (facilitar a vida do empreendedor). Os dois módulos só aparecem para MEI que presta serviço (`ehMei`: `sessionStorage cw.porte.<id>` começando com MEI). Menu simples do MEI (`ENXUTO`, sem títulos de grupo): Início · Agenda · Demandas · A receber · Meu negócio · Notas a emitir · Assistente · Contratos · Documentos · Minha empresa (no celular: Início, Agenda, Demandas, A receber, Mais).
- **Agenda e lembretes** (`modulos/agenda.js`, `#agenda`): compromissos (cliente, onde, hora) e lembretes, com repetição (semana/mês/ano; feito vale por data em `feitos[]`) e aviso (na hora, 15 min, 1 h, 1 dia antes). Coleção `agenda/{id}` (empresaId, tipo, titulo, data, hora, cliente, local, obs, repete, avisar, feito, feitos, removido, criadoPor…); nada se apaga (`removido:true`) e tudo vai para o histórico (`agenda.criar/mudar/feito/reabrir/tirar`). **Regras:** membro lê; admin/financeiro/operacional criam e mudam (campos fixos, sem trocar empresa ou autor); ninguém apaga (`teste-regras.js`). **Prazos automáticos** sem leitura nova: DAS e DASN (`CW.negocio.fiscal()`), a receber (`CW.titulos.proximos`, `vencIso`), demandas aceitas com prazo (`CW.ordens.lista()`), documentos com validade 15 dias antes (`CW.documentos.comValidade()`). Lembrete dentro do app: "Precisa de você"/número do ícone no dia e aviso na tela (toast + notificação do navegador se permitida) com o app aberto, a cada 30 s (`localStorage cw.ag.av.<id>.<data>` evita repetir). WhatsApp/e-mail/app fechado precisam de servidor.
- **Assistente** (`modulos/assistentemei.js`, `#assistentemei`): guiado, **sem IA** (escolha da usuária em 10/11/2026). Perguntas prontas e escritas (palavras inteiras, sem acento) para faturamento, limite, passar do limite, DAS, impostos, DASN, obrigações, nota, a receber, o que vence na semana, contador e clientes; responde com os números da pessoa (`CW.negocio.carregar/contas`, `fiscal`, `titulos`, `agenda`). `responder()` devolve Promise: a IA entra depois pelo servidor (Cloud Functions + chave no servidor, nunca no front), só para as perguntas sem resposta pronta. Teste: `teste-agenda.js` (10).
- **Visual do MEI · opção A "Botões grandes"** (escolhida em 10/11/2026 entre três protótipos): com o menu simples ativo, a página ganha `html.mei` (`montar()` em `js/app.js`; `CW.app.mei()`). O Início do MEI (`meiInicio` em `modulos/inicio.js`) esconde o título da página e mostra: faixa azul "Oi, Nome!" com a data; cartão **Hoje** (próximo item da agenda de hoje e o DAS); **6 botões grandes** coloridos (`TILES`: Minha agenda, Demandas, A receber, Emitir nota, Meu MEI, Tire uma dúvida; contador vermelho das pendências; textos como "1 coisa hoje", total a receber via `CW.titulos.proximos(...).centavos`, "DAS atrasado"); barra **Seu MEI em AAAA** (limite, azul/amarelo/vermelho, via `CW.negocio.carregar`); "Para fazer" só quando há pendências. Cores em tokens `--mei-*` com versão escura. Nas outras telas do MEI: letra maior, cartões com cantos de 20 px e botões de 44 px. As empresas que contratam não mudam. Teste: `teste-agenda.js` A10.
