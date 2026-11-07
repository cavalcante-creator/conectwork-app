# Plano · Cobrança e notas (Etapa 2, começando pela equipe contínua)

Decisões de 07/11/2026:
- **Começar pelo fluxo Colafix → prestadoras** (equipe contínua: Zenith e Nexus).
- **Cadeia:** cada PJ emite nota para a prestadora (Zenith/Nexus); a prestadora emite **uma** nota para a Colafix pelo total do período.
  Nesta fase o Conectwork cuida de **Colafix ↔ prestadora**. A parte **prestadora ↔ PJ** continua no "Pagamento dos PJ" do painel da Colafix e vem para o Conectwork na Etapa 3.
- **Nota emitida pelo prestador, fora do app** (Emissor Nacional/gov.br ou prefeitura), com os dados do espelho; o prestador envia o XML (e o PDF, opcional) e o Conectwork confere. Emitir pelo app exige servidor e certificado digital (CLAUDE.md, regra 4): fica para depois da fase 1.
- **Retenções informadas à mão** pelo responsável fiscal do tomador em cada espelho, até o contador definir as regras.
- **Medição vem do painel do RH** por um botão "Enviar ao Conectwork" (sem servidor; alguém da Colafix confere e confirma no Conectwork).

## O fluxo

```
Painel do RH (Pagamento dos PJ)          Conectwork
fecha a quinzena da Zenith  ──botão──▶  1. Medição recebida (Colafix confere e confirma o envio)
                                        2. Prestadora confirma a medição (ou aponta divergência)
                                        3. Aprovador técnico da Colafix aprova
                                        4. Espelho de faturamento (responsável fiscal informa retenções)
                                        5. Prestadora emite a NFS-e fora e envia o XML
                                        6. Validação tripla: contrato + medição + nota
                                        7. Título a pagar (Colafix) / a receber (prestadora)
                                           em validação → aprovado → liberado → agendado → liquidado → baixado
                                        8. Comprovante e histórico; avaliação do serviço da prestadora
```

### 1. Contrato contínuo (mínimo para a fase)
`contratos/{id}` com `modalidade: 'continua'`, `tomadorId`, `prestadorId`, `partes`, `objeto`, `periodicidade` (`quinzena` | `mes`), `vencimentoRegra` (ex.: 20 dias depois da nota válida; **vem do contrato e não muda por um lado só**), `interlocutor` (pessoa da prestadora), `inicio`, `fim`, `status`, assinatura simples das duas partes (quem e quando). Assinatura eletrônica com validade jurídica: depois.

### 2. Medição do período
`medicoes/{contratoId}_{periodo}` (o id impede duas medições do mesmo período). `periodo` = `AAAA-MM-1` (dias 1 a 15), `AAAA-MM-2` (16 ao fim) ou `AAAA-MM`, igual ao painel. `valorCentavos`, `memoria` (por profissional: nome, horas, valor; **sem CPF**), `origem` (`manual` | `integracao`), `status`: `enviada` → `confirmada_prestadora` | `divergencia` → `aprovada`. Cada passo grava quem, quando e o histórico.

### 3. Botão "Enviar ao Conectwork" (painel da Colafix)
- No "Pagamento dos PJ", com o período fechado, o botão monta o resumo **por prestadora** (Zenith, Nexus): período, CNPJ da prestadora, total e a memória (nome, horas, valor de cada PJ).
- Abre o Conectwork num endereço `#medicao/importar/<resumo>`. O resumo vai no próprio link, depois do `#`: não passa por servidor nenhum.
- No Conectwork, quem está logado na Colafix (cargo com permissão) vê a prévia, o app acha o contrato pela prestadora e a pessoa confirma. Só então a medição é gravada (`origem: 'integracao'`, `ref` = período do painel).
- Segurança: um link sozinho não grava nada; quem confirma é uma pessoa logada e com permissão, que confere os valores (equivale a digitar). Mandar o mesmo período duas vezes não duplica (id da medição).
- A mudança no painel é pequena (um botão no módulo `rh-pjpag.js`), mas segue o combinado do painel: pull request e testes.

### Formato do link (pronto no Conectwork desde a parte 2)
`<endereço do app>#medicoes/importar/<resumo>`, onde `<resumo>` é o JSON abaixo em UTF-8 codificado em **base64url** (sem `=` no fim):
```json
{ "v": 1, "origem": "painel-colafix", "periodo": "2026-11-1", "cnpj": "04252011000110", "nome": "ZENITH",
  "ref": "2026-11-1:ZENITH", "total": 712050,
  "itens": [ { "n": "Nome do PJ", "h": 96.8, "v": 352000 } ] }
```
`periodo` no formato do painel (`AAAA-MM-1`, `AAAA-MM-2` ou `AAAA-MM`); `cnpj` da prestadora só com números; valores em **centavos**; `h` = horas decimais (opcional); **sem CPF**. O Conectwork confere: link inteiro, quem abre pode lançar (admin ou RH), contrato ativo com esse CNPJ, período compatível com o contrato e soma das linhas = `total`.

### 4. Espelho de faturamento
Gerado quando a medição é aprovada: razão social, CNPJ e endereço do tomador; contrato; competência; descrição sugerida da nota; valor aprovado; **retenções informadas pelo responsável fiscal** (ISS, INSS, IR, PIS/COFINS/CSLL, cada uma com valor); líquido; vencimento previsto. A prestadora recebe "Serviço aprovado: confira os dados e envie sua nota fiscal".

### 5 e 6. Envio da nota e validação tripla
A prestadora envia o XML da NFS-e (padrão nacional e ABRASF; o leitor do painel, `lerXml`, serve de referência técnica). O app confere:
- **emitente** = CNPJ da prestadora do contrato;
- **tomador** = CNPJ da Colafix;
- **valor** = valor do espelho; **competência** = período;
- **duplicidade**: chave da nota, ou emitente + número + série (`chaveUnica`): **uma nota não gera dois títulos**.
Divergência bloqueia o título e explica o motivo; a Colafix pode recusar a nota com motivo; a prestadora envia outra. PDF sem XML: conferência à mão, marcada como tal.

### 7. Títulos (contas a pagar e receber)
`titulos/{id}`, espelhado para as duas empresas (`partes`). Estados: `recebido` → `em_validacao` → `pendente_correcao` | `aprovado` → `liberado` → `agendado` → `liquidado` → `baixado`; sinais `vencido`, `disputa`, `substituido`, `cancelado`. **Funções separadas:** quem aprova (fiscal/técnico) não libera; quem libera (financeiro) não liquida sozinho; a tesouraria agenda e confirma a liquidação com comprovante. **"Agendado" não é "pago"**: só baixa com liquidação confirmada. **O dinheiro não passa pelo Conectwork.** Nada se apaga: retificação fica no histórico. Troca de conta bancária da prestadora exige revisão reforçada.

## Ordem de construção (uma parte por vez, com testes e regras)
1. Contratos contínuos (cadastro, assinatura simples das duas partes).
2. Medições: lançar à mão, importar pelo link, confirmar, apontar divergência e aprovar.
3. Botão "Enviar ao Conectwork" no painel da Colafix (pull request no repositório do painel).
4. Espelho de faturamento com retenções digitadas. **Feito (07/11):** módulo "Espelhos da nota" (`espelhos/{id da medição}`).
5. Envio e conferência da nota (XML), duplicidade, recusa com motivo. **Feito (07/11):** botão "Emitir a nota" escolhe o site sozinho (o que a empresa definiu › o da cidade da empresa na tabela `config/emissores`, mantida pela equipe Conectwork em "Sites de emissão" › o Emissor Nacional) e, na volta, o app pede a nota; aceita **PDF** (lido pelo texto com o pdf.js) ou XML; XML que não bate é barrado; PDF sem texto vai para conferência à mão com o número digitado; a Colafix marca "Nota conferida" ou recusa com motivo.
6. Títulos com estados, funções separadas, calendário de vencimentos e comprovante. **Feito (07/11):** módulo "Pagar e receber" (`titulos/{id do espelho}`): nasce com a nota conferida; vencimento = dia da nota válida + dias do contrato; aprovado → liberado (financeiro, não quem conferiu) → agendado (tesouraria) → pago com comprovante (tesouraria, não quem liberou) → baixado (prestadora confirma). Conta para receber informada pela prestadora numa área privada do título; troca exige revisão do financeiro (confirmação por telefone) antes de agendar.
7. Avaliação do serviço da prestadora (depois do pagamento). **Feito (07/11):** cartão "Avaliação do serviço" no contrato (`avaliacoes/{id do título}`): admin ou aprovador técnico do tomador dá notas de 1 a 5 (qualidade, prazo, comunicação, fez o que foi combinado) e comentário; a prestadora responde uma vez.

## Antes de usar de verdade
- Publicar o `firestore.rules` no console (já pendente desde a Etapa 1).
- Colafix, Zenith e Nexus cadastradas e aprovadas no Conectwork, com as pessoas convidadas nos cargos certos.
- **Parecer jurídico sobre a modalidade equipe contínua** (o `PEDIDOS-CLAUDE-CODE.md` pede antes do Pedido 3). O app organiza e registra; não substitui a análise jurídica e contábil.
- **Regras de retenção com o contador** (até lá, digitadas à mão).

## Respostas (07/11/2026)
1. **Responsável fiscal = cargo Financeiro** (digita as retenções e aprova a nota). Não há cargo novo.
2. **Vencimento padrão: 1 dia depois da nota válida**, definido no contrato (`vencimentoDias`). Pode mudar, mas **nunca por um lado só**: uma empresa propõe o novo prazo e só vale quando a outra aceita (fica no histórico).
3. **A prestadora vê a memória da medição** (nome, horas e valor de cada PJ; sem CPF).

## Pendente
- **Triagem** (Lei 6.019, arts. 5º-C e 5º-D): **feita (07/11)** no contrato contínuo, antes de o tomador assinar. Falta o parecer jurídico geral sobre o modelo antes do piloto.
