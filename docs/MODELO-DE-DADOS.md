# Modelo de dados · Firestore

Convenções: IDs gerados pelo Firestore, salvo quando indicado. Datas em `serverTimestamp()`. Valores em centavos (inteiro), para não ter erro de arredondamento. E-mails sempre em minúsculas.

## Etapas 0 e 1 (base e acesso)

### `master/{uid}`
Quem é equipe Conectwork. Criado **à mão** no console. Campos: `nome`.

### `usuarios/{uid}`
Perfil da pessoa (o login é do Firebase Auth). Campos: `nome`, `email`, `tel`, `zap` (bool: recebe avisos), `criadoEm`, `atualizadoEm`.
Só a própria pessoa grava. A própria pessoa e a equipe master leem.

### `empresas/{empresaId}`
Dados públicos dentro da rede (outras empresas aprovadas podem ler).
`tipo` (`contratante` | `ambos` | `prestador`), `status` (`analise` | `pendencia` | `aprovado` | `recusado`), `nome` (fantasia), `razao`, `cnpj` (com máscara), `cnpjNum` (só os 14 números), `cidade`, `uf`, `protocolo` (CW-AAAA-0000), `modulos` (lista), `plano`, `criadoPor` (uid), `criadoEm`, `enviadoEm` (último envio para análise), `motivo` (texto do ajuste ou recusa).
- Criada pelo cadastro numa operação só, junto com `cnpjs/{cnpjNum}`, a área privada, o acesso admin do fundador, as autorizações e o histórico.
- Na correção (status `pendencia` → `analise`) o CNPJ não muda.
- Decisão da equipe master: `status`, `plano` (`essencial` | `profissional` | `rede` | `gratuito`; valores das mensalidades a definir), `modulos` (ids de `MODULOS_CONTRATAVEIS` em `js/permissoes.js`), `motivo`, `avaliadoEm`, `avaliadoPor` (nome).
- `modulos`, `status` e `taxa` só a equipe master altera.

### `empresas/{empresaId}/privado/cadastro`
Dados sensíveis do cadastro: `dados` (abertura, porte, regime, CNAE, IM, IE), `end` (cep, logradouro, numero, compl, bairro, cidade, uf), `resp` (nome, CPF, cargo, e-mail, e-mail financeiro, celular), `banco` (banco, tipo de conta, agência, conta, tipo e chave Pix), `docs` (nome e tamanho dos arquivos; o arquivo em si vai para o Storage numa etapa futura), `aceites` (declarações: verdade, termos, versão do texto), `reenviadoEm`, `conferidos` (equipe master: `{ doc: { nome do arquivo conferido, em, por } }`; se a empresa trocar o arquivo, o documento volta a ficar não conferido).
Certificado digital não fica aqui (segredo só no servidor, etapa futura).
Leem: membros da empresa, quem criou o cadastro e a equipe master.

### `cnpjs/{cnpj só números}`
Reserva do CNPJ para não haver cadastro repetido: `empresaId`, `criadoEm`. Qualquer pessoa logada consulta se existe (o CNPJ é público). Nasce junto com a empresa; ninguém altera nem apaga pelo app.

### `contadores/protocolo`
`ano`, `n`: sequência do protocolo CW-AAAA-0000. Só anda de 1 em 1 e recomeça em 1 no ano novo (atualizado na mesma transação do cadastro).

### `acessos/{empresaId}_{uid}`
O vínculo de uma pessoa com uma empresa (uma pessoa pode ter vários, é assim que funciona a troca de empresa).
`uid`, `empresaId`, `nome`, `email`, `cargo`, `extras` (lista de telas a mais), `sem` (lista de telas a menos), `ativo` (bool), `convite` (token usado), `criadoEm`.
- Criado por: equipe master; o fundador da empresa (quem criou o cadastro) como `admin`; ou a própria pessoa ao aceitar um convite válido.
- Alterado por: admin da empresa (não pode alterar o próprio) ou equipe master.

### `convites/{token}`
`token` = ID aleatório do documento, vai no link (`#convite/<token>`). `email` (minúsculas), `nome`, `tel` (WhatsApp, opcional, só para mandar o link), `empresaId`, `empresaNome` (quem foi convidado ainda não lê a empresa), `cargo`, `criadoPor`, `criadoPorNome`, `criadoEm`, `reenviadoEm`, `usado` (bool), `usadoEm`, `usadoPor`.
- Admin cria (só da própria empresa, cargo da lista), lista os da empresa, marca o reenvio e cancela (apaga). Não muda e-mail nem cargo depois de criado.
- Quem foi convidado só lê o convite depois de entrar com o e-mail convidado. Ao aceitar (uma operação só): cria `acessos/{empresaId}_{uid}` com o cargo do convite, `convite` = token, sem `extras`/`sem`; marca `usado`; grava perfil, autorizações (canal `convite`) e histórico.
O link é enviado pelo próprio admin por WhatsApp ou e-mail (botão que abre o WhatsApp com a mensagem pronta). Sem servidor na etapa 1.

### `log/{id}`
`em`, `uid`, `quem`, `empresaId` (ou `master`), `acao` (código curto), `texto` (frase legível), `ref` (id do documento afetado).
Só criação. Leem: admin da empresa e equipe master. Ninguém edita nem apaga.

## Etapa 2 (cobranças e notas) · a detalhar no pedido da etapa
### `cobrancas/{id}`
`contratanteId`, `prestadorId`, `partes` ([contratanteId, prestadorId]), `descricao`, `competencia` (AAAA-MM), `valorCentavos`, `status` (`aguardando` | `nota` | `paga` | `cancelada`), `tipo` (`periodo` | `encerramento`), `pessoaId` (profissional, quando houver), `origem` (`manual` | `integracao`), `nota` (número, emissão, chave, valor lido do XML, CNPJs, arquivo), `recusas` (lista), `pagaEm`, `criadoPor`, `criadoEm`.
Regras: contratante cria e paga ou recusa; prestador só preenche `nota`; cada lado só altera os próprios campos.

### `pessoas/{id}` (profissionais)
`nome`, `funcao`, `area`, `cidade`, `uf`, `vinculoId` (intermediária), `alocadoId` (contratante atual), `meiEmpresaId`, `docs` (nome, validade, arquivo), `desde`, `encerramento`.

## Etapa 2 em diante · motor comum e modalidades (substitui o rascunho de cobranças acima)

### `contratos/{id}`
`modalidade` (`os` | `continua`), `numero` (CW-AAAA-0000 para OS), `tomadorId`, `prestadorId`, `partes` ([tomadorId, prestadorId]), `objeto`, `entregaveis`, `criteriosAceite`, `valorCentavos` (OS) ou `regraMedicao` (contínua: período e base), `vencimentoRegra` (ex.: 20 dias após nota válida), `interlocutor` (pessoa da prestadora), `inicio`, `fim`, `status` (`assinatura` | `execucao` | `entregue` | `aceito` | `ativo` | `encerrado` | `cancelado`), `assinaturas` ({tomador:{uid, em}, prestador:{uid, em}}), `versoes` (alterações de escopo, preço e prazo com concordância), `triagem` (respostas e resultado), `demandaId`, `criadoPor`, `criadoEm`.

### `demandas/{id}` e `demandas/{id}/propostas/{prestadorId}`
Demanda: `tomadorId`, `titulo`, `categoria`, `escopo`, `entregaveis`, `local`, `prazo`, `criteriosAceite`, `orcamento`, `triagem`, `status` (`rascunho` | `analise_juridica` | `aberta` | `contratada` | `cancelada`).
Proposta: `prestadorId`, `valorCentavos`, `prazo`, `condicoes`, `status` (`enviada` | `escolhida` | `nao_escolhida` | `retirada`). Recusa do prestador fica em `demandas/{id}/recusas/{prestadorId}` e não afeta reputação.

### `medicoes/{id}` (equipe contínua)
`contratoId`, `periodo` (AAAA-MM-Q1/Q2 ou AAAA-MM), `valorCentavos`, `memoria` (como foi calculado), `origem` (`manual` | `integracao`), `tipo` (`periodo` | `encerramento`), `status` (`enviada` | `confirmada_prestadora` | `aprovada` | `divergencia`).


### `espelhos/{id}` (espelho da nota · id = id da medição)
`medicaoId`, `contratoId`, `tomadorId`, `prestadorId`, `partes`, `tomadorNome`, `prestadorNome`, `prestadorCnpj`, `tomador` (razão social, CNPJ, inscrição municipal, endereço, cidade, UF: cópia do cadastro do tomador, porque a prestadora não lê a área privada dele), `periodo`, `competencia` (AAAA-MM), `descricao` (sugerida, editável), `valorCentavos` (= o da medição aprovada), `retencoes` {`iss`,`inss`,`ir`,`pcc`} em centavos (informadas à mão pelo financeiro), `liquidoCentavos` (= valor − retenções), `vencimentoDias` (= o do contrato, não muda no espelho), `obs`, `status` (`aguardando_nota`; as próximas partes acrescentam a nota e a conferência), `versao` (sobe a cada correção), `criadoPor/Nome/Em`, `atualizadoPor/Nome/Em`. Prepara e corrige: admin ou financeiro do tomador; a prestadora lê; ninguém apaga.
Nota fiscal (parte 5): `emissao` {uid, nome, em} (a prestadora abriu o emissor), `nota` {tipo `pdf`|`xml`, nomeArquivo, tam, envio, partes, chave (50 números), numero, chaveUnica, emitenteCnpj, valorCentavos (lido do XML), competencia, emissao, conferencia {ok, manual, itens}, enviadoPor/Nome/Em}, `recusadas` [{numero, chaveUnica, motivo, uid, nome, em…}], `conferenciaNota` {uid, nome, em, manual}. `status`: `aguardando_nota` → `nota_enviada` → `nota_ok` (recusada volta a `aguardando_nota`).
Site para emitir: `empresas/{id}/privado/cadastro.emissor` {url, nome, por, em} (o admin define) e `config/emissores` {cidades: {"UF|CIDADE": {cidade, url}}} (equipe Conectwork).
O arquivo fica em `espelhos/{id}/arquivos/{envio}-{k}` (base64 em pedaços de até 700 mil caracteres, até 3 MB) e a nota reserva `notaschave/{chaveUnica}` (chave de acesso ou CNPJ do emitente_número): uma nota não serve para dois espelhos, nem depois de recusada.
### `titulos/{id}` (contas a pagar e receber · id = id do espelho)
`espelhoId`, `medicaoId`, `contratoId`, `tomadorId`, `prestadorId`, `partes`, `tomadorNome`, `prestadorNome`, `periodo`, `notaNumero`, `chaveUnica`, `valorCentavos`, `liquidoCentavos`, `retencoes`, `vencimentoDias`, `base` (hora da nota válida: vencimento = base + dias), `status` (`aprovado` | `liberado` | `agendado` | `liquidado` | `baixado`; "vencido" é calculado na tela), `aprovacao`, `liberacao`, `agendamento` {…, data}, `liquidacao` {…, data, comprovante {envio, partes, nome, tipo, tam}}, `baixa`, `conta` {ok, revisao, versao, em, nome, revisadoPor/Nome/Em}, `criadoEm`, `atualizadoEm`.
`titulos/{id}/privado/conta` {banco, agencia, conta, tipo, pix, titular, doc, versao, em, por, porNome}: lê só admin/financeiro/tesouraria do tomador e admin/financeiro da prestadora. Comprovante em `titulos/{id}/arquivos/{envio}-{k}`.
Próximas versões: disputa, nota substituída, cancelamento.
### `avaliacoes/{id}`
Equipe contínua (feito): id = id do título; `tipo: 'servico_prestadora'`, `tituloId`, `contratoId`, `tomadorId`, `prestadorId`, `partes`, `periodo`, `notas` {qualidade, prazo, comunicacao, escopo: 1 a 5}, `comentario`, `por`, `porNome`, `em`, `resposta` {texto, uid, nome, em}. Modelo geral: `tipo` (`servico_os` | `servico_prestadora` | `profissional` | `tomador`), `de`, `para`, `ref` (contrato, título ou medição), `notas` (qualidade, prazo, comunicação, aderência ao escopo; para tomador: clareza do escopo, processo de aceite, pontualidade), `comentario`, `resposta`, `visivelEm` (quando os dois avaliarem ou após 7 dias).

### `certidoes/{prestadorId}_{tipo}`
`tipo` (`federal` | `fgts` | `trabalhista`), `validade`, `arquivo`, `situacao`.

### `consentimentos/{uid}_{finalidade}` e `consentimentos_log/{id}`
Estado atual por finalidade (`operacional`, `contrato`, `cobranca`, `cursos`, `ofertas`, `whatsapp`, `email`, `push`) e histórico imutável: `uid`, `finalidade`, `aceite`, `texto` (a frase que a pessoa marcou), `textoVersao`, `canal` (ex.: `cadastro`), `em` (hora do servidor), `revogadoEm`.
Gravados a partir da Etapa 1 (cadastro). Só a própria pessoa grava; a própria pessoa e a equipe master leem; o histórico não muda.

### `cursos/{id}` e `cursos/{id}/inscricoes/{uid}`
`titulo`, `emissor`, `carga`, `modalidade`, `validade`, `certificado`, `area`, `demandaId` (opcional). Inscrição não cria vínculo nem contratação.

### `logos/{empresaId}`
`d` (imagem PNG, JPEG ou WEBP em base64, reduzida no aparelho para até 256 px, até 200 mil caracteres), `nome`, `em`, `por`. Todos os logados veem; só o admin da empresa troca ou tira. SVG não é aceito.
