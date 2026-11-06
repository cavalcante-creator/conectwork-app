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
`tipo` (`contratante` | `ambos` | `prestador`), `status` (`analise` | `pendencia` | `aprovado` | `recusado`), `nome` (fantasia), `razao`, `cnpj`, `cidade`, `uf`, `protocolo`, `modulos` (lista), `criadoPor` (uid), `criadoEm`, `motivo` (texto do ajuste ou recusa).
- `modulos`, `status` e `taxa` só a equipe master altera.

### `empresas/{empresaId}/privado/cadastro`
Dados sensíveis do cadastro: `dados` (porte, regime, CNAE, IE, IM, abertura), `end`, `resp` (nome, CPF, cargo, e-mail, celular), `banco`, `docs` (nome e tamanho dos arquivos; o arquivo em si vai para o Storage numa etapa futura), `taxa`, `conferidos`, `historico`.
Leem: membros da empresa, quem criou o cadastro e a equipe master.

### `acessos/{empresaId}_{uid}`
O vínculo de uma pessoa com uma empresa (uma pessoa pode ter vários, é assim que funciona a troca de empresa).
`uid`, `empresaId`, `nome`, `email`, `cargo`, `extras` (lista de telas a mais), `sem` (lista de telas a menos), `ativo` (bool), `convite` (token usado), `criadoEm`.
- Criado por: equipe master; o fundador da empresa (quem criou o cadastro) como `admin`; ou a própria pessoa ao aceitar um convite válido.
- Alterado por: admin da empresa (não pode alterar o próprio) ou equipe master.

### `convites/{token}`
`token` = ID aleatório do documento, vai no link. `email`, `empresaId`, `cargo`, `nome`, `criadoPor`, `criadoEm`, `usado` (bool), `usadoEm`, `usadoPor`.
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
