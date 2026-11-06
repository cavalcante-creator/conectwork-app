# Requisitos · Fase 1 (piloto Colafix)

Referência visual e de fluxo: `docs/prototipo-referencia.html` (tem um tour guiado). Este documento diz **o que** o app faz; o protótipo mostra **como fica**. Regras de negócio: `CLAUDE.md`.

## Etapa 0 · Base (pronta)
Casca, login com e-mail e senha, "Esqueci minha senha", sessão com escolha e troca de empresa, menu por permissão, componentes de tela, histórico, testes.

## Etapa 1 · Acesso
1. **Cadastro de empresa** em etapas, começando por **"Crie seu acesso"** (nome, e-mail, senha forte; cria a conta e envia confirmação de e-mail). Depois: tipo e dados, endereço, responsável, banco, documentos (só nome e tamanho por enquanto), revisão com aceites. O rascunho fica só no navegador; no envio grava `empresas/{id}`, `empresas/{id}/privado/cadastro` e o acesso admin do fundador. CNPJ não pode repetir.
2. **Análise de cadastros** (equipe master): lista por situação; análise com documentos conferidos, **plano** e módulos; aprovar, pedir ajuste e recusar com motivo obrigatório.
3. **Meu cadastro** para empresa não aprovada, com "Corrigir cadastro".
4. **Usuários e acessos**: cargos do CLAUDE.md (admin, solicitante, aprovador técnico, financeiro, tesouraria, rh, operacional, contador, consulta), ajuste por pessoa, bloquear e liberar.
5. **Convites** com link, "Enviar pelo WhatsApp" e "Copiar link"; reenviar e cancelar.
6. **Primeiro acesso pelo convite** (#convite/<token>).
7. **Troca de empresa** no topo.
8. **Histórico de alterações** (hora do servidor exigida nas regras).
9. **Minha empresa**: dados, documentos, módulos e plano.
10. **Consentimentos e privacidade**: no cadastro e no primeiro acesso, autorizações separadas com cursos e ofertas desmarcados; tela "Privacidade" para mudar e revogar; registro com texto, versão, data, finalidade e canal (coleção `consentimentos`). Banner de privacidade na primeira visita.

## Etapa 2 · Motor comum (contratos, faturamento e contas)
1. **Contratos** com `modalidade` (`os` ou `continua`), partes, objeto, vigência, vencimento (regra objetiva), interlocutor da prestadora, assinatura das duas partes (registro simples nesta etapa; assinatura eletrônica com validade jurídica depois).
2. **Aceite / medição**: aprovar total, parcial (com valor) ou apontar divergência (motivo e evidência), com prazo de resposta visível e lembrete.
3. **Espelho de faturamento** gerado no aceite: razão social, CNPJ e endereço do tomador, contrato/OS, descrição, valor aprovado, retenções informadas pelo responsável fiscal, vencimento. O prestador recebe "Serviço aprovado: confira os dados e envie sua nota fiscal".
4. **Envio da nota** (XML da NFS-e) e **validação tripla**: emitente, tomador, valor, contrato/OS e **duplicidade** (chave ou emitente + número + série). Divergência bloqueia o título e explica o motivo. Recusa de nota com motivo.
5. **Títulos (contas a pagar e receber)**, espelhados para as duas partes, com estados: recebido → em validação → pendente de correção | aprovado → liberado → agendado → liquidado → baixado; sinalizações vencido, em disputa, substituído, cancelado. Calendário de vencimentos, comprovante, pagamento em lote. Nada é apagado: retificações ficam no histórico.
6. **Funções separadas**: solicitante, aprovador técnico, responsável fiscal, tesouraria (novos cargos ou permissões de ação).
7. **Avaliação** conforme `CLAUDE.md`.

## Etapa 3 · Equipe contínua e integração com o painel da Colafix
Contrato contínuo com a prestadora; **medição do período** recebida do `rh-pjpag.js` (conta de integração da Colafix, `tipo: periodo | encerramento`); confirmação da medição pela prestadora; profissionais da prestadora (cadastro, convite do MEI, documentos com validade e renovação, alocação, encerramento do serviço); **certidões da prestadora** (federal, FGTS, trabalhista) com validade e alerta.

## Etapa 4 · Serviço por OS
**Triagem da contratação**; **demanda** (categoria, problema, entregáveis, local, prazo, critérios de aceite, orçamento indicativo, faturamento); **oportunidades** para prestadores compatíveis, com proposta (preço, prazo, condições) e recusa sem penalidade; **comparador de propostas**; escolha gera contrato e **OS** com número único; execução com marcos e evidências; entrega e aceite (Etapa 2). Mudanças de escopo, preço ou prazo ficam versionadas e exigem concordância.

## Etapa 5 · Complementos da fase 1
Área do MEI (faturamento x limite, DAS, declaração anual), currículo e índice, indicação, relatórios e exportação, central de ajuda, avisos pelo WhatsApp (precisa de servidor e provedor), disputas e moderação na administração.

## Etapa 6 · Áreas do prompt mestre
**Matching por especialidade** (especialidades e habilitações no cadastro; aviso diz por que a pessoa recebeu), **conformidade** (situação do CNPJ, certidões e documentos com estados Regular, Atenção, Pendente, Bloqueado, Em revisão; documento vencido bloqueia nova contratação), **aprendizado** (cursos, "Quero aprender", convite só para quem autorizou; inscrição não é contratação), **central de notificações** e **modo offline** (aviso e fila de sincronização, sem fingir processamento de nota ou pagamento).

## Depois da fase 1
Clube de ofertas e painel do parceiro (com consentimento LGPD granular), assinatura eletrônica integrada, integração com ERP e retorno bancário, emissão de NFS-e pela plataforma, retenções automáticas, MFA para ações sensíveis, conta e antecipação com banco parceiro.
