/* Conectwork · permissões em dois níveis (CLAUDE.md, regra de ouro 2):
   1) módulos contratados pela empresa (empresas/{id}.modulos, ligados pela equipe Conectwork);
   2) cargo da pessoa na empresa (acessos/{empresa}_{uid}.cargo), com ajuste individual:
      extras = telas a mais, sem = telas a menos.
   Aqui a tela só decide o que MOSTRAR. Quem protege os dados é o firestore.rules. */
(function () {
  const CW = window.CW = window.CW || {};

  /* Cargos do CLAUDE.md. "telas" usa o id do módulo (CW.registrarModulo). '*' = tudo da empresa.
     Os ids das telas das próximas etapas já ficam aqui para o menu nascer certo:
     pagar (cobranças a pagar / fechamentos), receber (a receber / notas a emitir), integracao, relatorios,
     conta, empresa (dados da empresa), catalogo, profissionais, usuarios, historico. */
  const CARGOS = {
    admin:       { nome: 'Administrador', telas: '*', desc: 'Vê tudo da empresa, convida pessoas, define cargos e ajusta acessos.' },
    financeiro:  { nome: 'Financeiro', telas: ['pagar', 'receber', 'relatorios', 'conta', 'empresa'], desc: 'Pagar, receber, relatórios, conta e dados da empresa.' },
    rh:          { nome: 'RH', telas: ['pagar', 'integracao', 'relatorios', 'catalogo'], desc: 'Fechamentos, integração, relatórios e catálogo.' },
    operacional: { nome: 'Operacional', telas: ['receber', 'profissionais', 'catalogo'], desc: 'Notas a emitir, profissionais e catálogo.' },
    contador:    { nome: 'Contador (só leitura)', telas: ['pagar', 'receber', 'relatorios'], soLeitura: true, desc: 'Só leitura: cobranças e relatórios.' },
    consulta:    { nome: 'Só consulta', telas: ['pagar', 'receber', 'relatorios', 'empresa'], soLeitura: true, desc: 'Só leitura das telas liberadas.' }
  };

  const cargo = id => CARGOS[id] || null;
  const nomeCargo = id => (CARGOS[id] && CARGOS[id].nome) || 'Sem cargo';

  /* Pode ver o módulo `mod` no contexto `ctx` ({ tipo: 'master' } ou { tipo: 'empresa', empresa, acesso })?
     Opções do módulo (definidas no registro):
       para:          ['empresa'] (padrão), ['master'] ou ['empresa','master']
       livre:         true = qualquer cargo vê (ex.: Início)
       semAprovacao:  true = aparece mesmo com a empresa ainda em análise
       contrato:      id do módulo contratado exigido em empresas/{id}.modulos (ex.: 'cobrancas') */
  function podeVer(mod, ctx) {
    if (!mod || !ctx) return false;
    const para = mod.para || ['empresa'];
    if (ctx.tipo === 'master') return para.includes('master');
    if (ctx.tipo !== 'empresa' || !para.includes('empresa')) return false;
    const emp = ctx.empresa || {}, ac = ctx.acesso || {};
    if (ac.ativo !== true) return false;
    if (emp.status !== 'aprovado' && !mod.semAprovacao) return false;
    if (mod.contrato && !(emp.modulos || []).includes(mod.contrato)) return false;
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

  CW.permissoes = { CARGOS, cargo, nomeCargo, podeVer, soLeitura };
})();
