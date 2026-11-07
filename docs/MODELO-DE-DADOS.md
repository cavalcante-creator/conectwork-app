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

### `titulos/{id}` (contas a pagar e receber)
`contratoId`, `origemId` (aceite ou medição), `tomadorId`, `prestadorId`, `partes`, `espelho` (dados para a nota), `nota` (chave, número, série, emitente, valor lido, XML), `chaveUnica` (para impedir duplicidade), `valorBrutoCentavos`, `retencoes`, `valorLiquidoCentavos`, `vencimento`, `estado` (`recebido` | `em_validacao` | `pendente_correcao` | `aprovado` | `liberado` | `agendado` | `liquidado` | `baixado`), `sinais` (`vencido`, `disputa`, `substituido`, `cancelado`), `aprovacoes` (técnica, fiscal, financeira com uid e data), `comprovante`, `historico`.

### `avaliacoes/{id}`
`tipo` (`servico_os` | `servico_prestadora` | `profissional` | `tomador`), `de`, `para`, `ref` (contrato, título ou medição), `notas` (qualidade, prazo, comunicação, aderência ao escopo; para tomador: clareza do escopo, processo de aceite, pontualidade), `comentario`, `resposta`, `visivelEm` (quando os dois avaliarem ou após 7 dias).

### `certidoes/{prestadorId}_{tipo}`
`tipo` (`federal` | `fgts` | `trabalhista`), `validade`, `arquivo`, `situacao`.

### `consentimentos/{uid}_{finalidade}` e `consentimentos_log/{id}`
Estado atual por finalidade (`operacional`, `contrato`, `cobranca`, `cursos`, `ofertas`, `whatsapp`, `email`, `push`) e histórico imutável: `uid`, `finalidade`, `aceite`, `texto` (a frase que a pessoa marcou), `textoVersao`, `canal` (ex.: `cadastro`), `em` (hora do servidor), `revogadoEm`.
Gravados a partir da Etapa 1 (cadastro). Só a própria pessoa grava; a própria pessoa e a equipe master leem; o histórico não muda.

### `cursos/{id}` e `cursos/{id}/inscricoes/{uid}`
`titulo`, `emissor`, `carga`, `modalidade`, `validade`, `certificado`, `area`, `demandaId` (opcional). Inscrição não cria vínculo nem contratação.
