/* Conectwork · permissões em dois níveis (CLAUDE.md, regra de ouro 2):
   1) módulos contratados pela empresa (empresas/{id}.modulos, ligados pela equipe Conectwork);
   2) cargo da pessoa na empresa (acessos/{empresa}_{uid}.cargo), com ajuste individual:
      extras = telas a mais, sem = telas a menos.
   Aqui a tela só decide o que MOSTRAR. Quem protege os dados é o firestore.rules. */
(function () {
  const CW = window.CW = window.CW || {};

  /* Cargos do CLAUDE.md. "telas" usa o id do módulo (CW.registrarModulo). '*' = tudo da empresa.
     Os ids das telas das próximas etapas já ficam aqui para o menu nascer certo:
     pagar (contas a pagar / fechamentos), receber (a receber / notas a emitir), integracao, relatorios,
     conta, empresa (dados da empresa), catalogo, profissionais, usuarios, historico,
     demandas, contratos, medicoes (medição do período da equipe contínua), espelhos (espelho da nota), titulos (contas a pagar e receber), notificacoes.
     Funções separadas no tomador: quem pede (solicitante) não aprova (aprovador) nem paga (tesouraria).
     A ordem abaixo é a ordem em que os cargos aparecem nas telas. */
  const CARGOS = {
    admin:       { nome: 'Administrador', telas: '*', desc: 'Vê tudo da empresa, convida pessoas, define cargos e ajusta acessos.' },
    solicitante: { nome: 'Solicitante', telas: ['demandas', 'contratos', 'notificacoes'], desc: 'Abre demandas e acompanha contratos; não aprova pagamento.' },
    aprovador:   { nome: 'Aprovador técnico', telas: ['contratos', 'medicoes', 'demandas', 'notificacoes'], desc: 'Aprova entregas e medições; não libera pagamento.' },
    financeiro:  { nome: 'Financeiro', telas: ['pagar', 'receber', 'medicoes', 'espelhos', 'titulos', 'relatorios', 'conta', 'empresa'], desc: 'Pagar, receber, relatórios, conta e dados da empresa.' },
    tesouraria:  { nome: 'Tesouraria', telas: ['titulos', 'pagar', 'notificacoes'], desc: 'Agenda pagamentos liberados e confirma a liquidação.' },
    rh:          { nome: 'RH', telas: ['pagar', 'medicoes', 'integracao', 'relatorios', 'catalogo'], desc: 'Fechamentos, integração, relatórios e catálogo.' },
    operacional: { nome: 'Operacional', telas: ['receber', 'espelhos', 'profissionais', 'catalogo'], desc: 'Notas a emitir, profissionais e catálogo.' },
    contador:    { nome: 'Contador (só leitura)', telas: ['pagar', 'receber', 'espelhos', 'titulos', 'relatorios'], soLeitura: true, desc: 'Só leitura: cobranças e relatórios.' },
    consulta:    { nome: 'Só consulta', telas: ['pagar', 'receber', 'espelhos', 'titulos', 'relatorios', 'empresa'], soLeitura: true, desc: 'Só leitura das telas liberadas.' }
  };

  const cargo = id => CARGOS[id] || null;
  const nomeCargo = id => (CARGOS[id] && CARGOS[id].nome) || 'Sem cargo';

  /* Pode ver o módulo `mod` no contexto `ctx` ({ tipo: 'master' } ou { tipo: 'empresa', empresa, acesso })?
     Opções do módulo (definidas no registro):
       para:          ['empresa'] (padrão), ['master'] ou ['empresa','master']
       livre:         true = qualquer cargo vê (ex.: Início)
       semAprovacao:  true = aparece mesmo com a empresa ainda em análise
       contrato:      id (ou lista de ids) do módulo contratado exigido em empresas/{id}.modulos; com lista, basta um
       soAdmin:       true = só o cargo admin vê (não entra no ajuste por pessoa)
       mostrar(ctx):  condição extra (ex.: "Meu cadastro" só enquanto a empresa não foi aprovada) */
  function podeVer(mod, ctx) {
    if (!mod || !ctx) return false;
    const para = mod.para || ['empresa'];
    if (ctx.tipo === 'master') return para.includes('master');
    if (ctx.tipo !== 'empresa' || !para.includes('empresa')) return false;
    const emp = ctx.empresa || {}, ac = ctx.acesso || {};
    if (ac.ativo !== true) return false;
    if (emp.status !== 'aprovado' && !mod.semAprovacao) return false;
    if (mod.contrato && ![].concat(mod.contrato).some(c => (emp.modulos || []).includes(c))) return false;   /* um ou vários: basta ter um */
    if (typeof mod.mostrar === 'function' && !mod.mostrar(ctx)) return false;
    if (mod.soAdmin) return ac.cargo === 'admin';   /* ex.: Usuários e acessos (as regras do banco também exigem admin) */
    if (mod.livre) return true;
    if ((ac.sem || []).includes(mod.id)) return false;
    const c = cargo(ac.cargo); if (!c) return (ac.extras || []).includes(mod.id);
    return c.telas === '*' || c.telas.includes(mod.id) || (ac.extras || []).includes(mod.id);
  }

  /* cargos de só leitura não gravam nada (a tela esconde os botões; as regras do banco ainda conferem) */
  function soLeitura(ctx) {
    if (!ctx || ctx.tipo === 'master') return false;
    const c = cargo(ctx.acesso && ctx.acesso.cargo); return !c || !!c.soLeitura;
  }

  /* Módulos que a equipe Conectwork liga para cada empresa (empresas/{id}.modulos) e planos de mensalidade.
     O plano só sugere os módulos; a equipe pode ligar e desligar um a um. Receita = mensalidade, sem comissão.
     Valores das mensalidades: a definir (não ficam no app por enquanto). "fase" = quando o módulo entra no ar. */
  const MODULOS_CONTRATAVEIS = [
    { id: 'equipe', nome: 'Usuários e acessos', fase: 1, desc: 'Vários logins por empresa, cada um com seu cargo.' },
    { id: 'cobrancas', nome: 'Cobranças e notas', fase: 1, desc: 'Pedido de nota, conferência da nota, contas a pagar e receber.' },
    { id: 'contratos', nome: 'Contratos e OS', fase: 1, desc: 'Contratos das duas modalidades, aceite, medição e espelho de faturamento.' },
    { id: 'integracao', nome: 'Integração com o RH', fase: 1, desc: 'Recebe a medição do período do painel do RH do tomador.' },
    { id: 'profissionais', nome: 'Profissionais', fase: 2, desc: 'Pessoas que a prestadora disponibiliza para os clientes.' },
    { id: 'emissao', nome: 'Emissão de NFS-e', fase: 2, desc: 'Nota emitida pelo Conectwork (certificado só no servidor).' },
    { id: 'demandas', nome: 'Demandas e propostas', fase: 2, desc: 'Triagem, demanda, propostas, comparador e OS.' },
    { id: 'catalogo', nome: 'Catálogo', fase: 3, desc: 'Busca e solicitação de profissionais da rede.' },
    { id: 'conta', nome: 'Conta e benefícios', fase: 3, desc: 'Conta digital e benefícios com parceiros.' }
  ];
  const PLANOS = {
    essencial: { nome: 'Essencial', desc: 'Cobranças, notas, usuários e integração com o RH.', modulos: ['equipe', 'cobrancas', 'integracao'] },
    profissional: { nome: 'Profissional', desc: 'Essencial + contratos, profissionais e emissão de NFS-e.', modulos: ['equipe', 'cobrancas', 'integracao', 'contratos', 'profissionais', 'emissao'] },
    rede: { nome: 'Rede', desc: 'Profissional + demandas, catálogo e conta.', modulos: ['equipe', 'cobrancas', 'integracao', 'contratos', 'profissionais', 'emissao', 'demandas', 'catalogo', 'conta'] },
    gratuito: { nome: 'Gratuito para profissional', desc: 'Profissional MEI: cadastro grátis.', modulos: ['cobrancas'] }
  };
  const nomePlano = id => (PLANOS[id] && PLANOS[id].nome) || '';

  CW.permissoes = { CARGOS, cargo, nomeCargo, podeVer, soLeitura, MODULOS_CONTRATAVEIS, PLANOS, nomePlano };
})();
