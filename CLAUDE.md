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
- Visual e textos: siga `docs/prototipo-referencia.html` (cores, fonte, componentes, modo claro e escuro). **Tema escuro é o padrão** (07/11/2026); a pessoa troca no botão do topo: escuro → claro → automático. O protótipo é a referência visual e de fluxo; o código dele é só ilustrativo e **não** deve ser copiado como base (ele guarda tudo em localStorage).

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
- Regra: `empresas` create aceita, só para `master()`, `status 'aprovado'` com `preCadastro == true`, plano, módulos e avaliação. Testes: `teste-precadastro.js` e `teste-regras.js`.

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
