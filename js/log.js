/* Conectwork · histórico de alterações (coleção log/, ver docs/MODELO-DE-DADOS.md).
   Toda ação que muda dados chama CW.registrarLog(acao, texto, ref).
   - acao:  código curto, ex.: 'convite.criar', 'acesso.cargo', 'empresa.aprovar'
   - texto: frase legível, ex.: 'Convite enviado para Ana (ana@empresa.com.br).'
            LGPD: no texto, só nome e e-mail de pessoas. Nada de CPF, banco, telefone ou endereço.
   - ref:   id do documento afetado (opcional)
   - op.empresaId: empresa do registro, quando for diferente da empresa atual
                   (ex.: o fundador gravando o cadastro antes de ter acesso).
   O registro não pode ser editado nem apagado (firestore.rules). */
(function () {
  const CW = window.CW = window.CW || {};

  function montarLog(acao, texto, ref, op) {
    op = op || {};
    const s = CW.sessao && CW.sessao.estado();
    const u = s && s.usuario;
    if (!u) throw new Error('registrarLog: ninguém logado');
    const ctx = s.contexto;
    const empresaId = op.empresaId || (ctx && ctx.tipo === 'master' ? 'master' : ctx && ctx.empresaId);
    if (!empresaId) throw new Error('registrarLog: sem empresa no contexto');
    if (!acao || !texto) throw new Error('registrarLog: informe a ação e o texto');
    return {
      em: CW.fb.agora(),
      uid: u.uid,
      quem: (s.perfil && s.perfil.nome) || u.email || '',
      empresaId,
      acao: String(acao).slice(0, 60),
      texto: String(texto).slice(0, 500),
      ref: ref ? String(ref) : ''
    };
  }

  /* grava e devolve a referência do documento criado; em caso de erro, lança (quem chamou decide o aviso) */
  async function registrarLog(acao, texto, ref, op) {
    const d = montarLog(acao, texto, ref, op);
    return CW.fb.db().collection('log').add(d);
  }

  /* para gravar o log junto com a alteração, na mesma operação (batch ou transação do Firestore) */
  function logNoLote(lote, acao, texto, ref, op) {
    lote.set(CW.fb.db().collection('log').doc(), montarLog(acao, texto, ref, op));
    return lote;
  }

  CW.registrarLog = registrarLog;
  CW.log = { registrarLog, logNoLote, montarLog };
})();
