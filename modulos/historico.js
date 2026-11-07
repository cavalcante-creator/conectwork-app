/* Conectwork · Etapa 1, parte 5: histórico de alterações (log/).
   - Administrador da empresa: o histórico da própria empresa.
   - Equipe Conectwork: de todas as empresas ou de uma escolhida.
   Filtros por pessoa e por assunto, busca no texto e "Mostrar mais". Só leitura: o histórico não se edita nem se apaga
   (firestore.rules). Mais recente primeiro: precisa do índice log (empresaId + em) do firestore.indexes.json;
   enquanto o índice não existe, busca sem ordem e ordena aqui (com aviso). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const PASSO = 100;

  const ASSUNTOS = [
    ['empresa', 'Cadastro e análise', 'building'], ['cadastro', 'Documentos', 'file'], ['acesso', 'Acessos', 'shield'],
    ['convite', 'Convites', 'mail'], ['outro', 'Outros', 'list']
  ];
  const assunto = a => { const p = String(a || '').split('.')[0]; return ASSUNTOS.some(x => x[0] === p) ? p : 'outro'; };
  const cor = a => /aprovar|aceitar|liberar|conferir$/.test(a) ? 'ok' : /ajuste|bloquear|cancelar|desconferir/.test(a) ? 'warn' : /recusar/.test(a) ? 'danger' : '';
  const ms = v => { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; const t = Date.parse(v); return isNaN(t) ? 0 : t; };
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let S = null;           /* { regs, limite, emp, pessoa, assunto, busca, semIndice, carregando, empresas } */
  const novo = () => ({ regs: null, limite: PASSO, emp: '', pessoa: '', assunto: '', busca: '', semIndice: false, carregando: false, empresas: null, erro: '' });

  async function buscar(ctx) {
    const db = CW.fb.db(), master = ctx.contexto.tipo === 'master';
    const emp = master ? S.emp : ctx.contexto.empresaId;
    let base = db.collection('log');
    if (emp) base = base.where('empresaId', '==', emp);
    S.carregando = true; S.erro = '';
    try {
      let snap;
      try { snap = await base.orderBy('em', 'desc').limit(S.limite).get(); S.semIndice = false; }
      catch (e) {
        if (!/failed-precondition/.test(e && e.code || '')) throw e;
        snap = await base.limit(Math.max(S.limite, 500)).get(); S.semIndice = true;      /* índice ainda não criado no console */
      }
      S.regs = CW.fb.lista(snap).sort((a, b) => ms(b.em) - ms(a.em)).slice(0, S.limite);
      S.temMais = snap.size >= S.limite;
    } catch (e) { S.regs = S.regs || []; S.erro = CW.fb.mensagemErro(e); }
    S.carregando = false;
  }

  async function empresasMaster() {
    if (S.empresas) return;
    try { S.empresas = CW.fb.lista(await CW.fb.db().collection('empresas').get()).sort((a, b) => String(a.nome || a.razao).localeCompare(String(b.nome || b.razao), 'pt-BR')); }
    catch (e) { S.empresas = []; }
  }

  function filtrados() {
    const q = semAcento(S.busca).split(/\s+/).filter(Boolean);
    return S.regs.filter(r => (!S.pessoa || r.uid === S.pessoa) && (!S.assunto || assunto(r.acao) === S.assunto)
      && (!q.length || q.every(p => semAcento(r.texto + ' ' + r.quem).includes(p))));
  }

  function desenhar(el, ctx) {
    const { esc, ic, formatarDataHora, formatarData } = U(), master = ctx.contexto.tipo === 'master';
    if (!S.regs) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando o histórico…</span></div></div>`; return; }
    const pessoas = Array.from(new Map(S.regs.map(r => [r.uid, r.quem || 'Sem nome'])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const lista = filtrados();
    const nomeEmp = id => { if (id === 'master') return 'Equipe Conectwork'; const e = (S.empresas || []).find(x => x._id === id); return e ? (e.nome || e.razao) : ''; };
    /* agrupa por dia */
    let dia = '';
    const linhas = lista.map(r => {
      const d = formatarData(r.em) || 'Sem data', cab = d !== dia ? `<li class="hs-dia">${esc(d)}</li>` : ''; dia = d;
      const hora = (formatarDataHora(r.em) || '').slice(11);
      return `${cab}<li class="hs-reg"><span class="b ${cor(r.acao)}"></span><div><p>${esc(r.texto)}</p>
        <small>${esc(hora)}${r.quem ? ' · ' + esc(r.quem) : ''}${master && !S.emp && r.empresaId ? ' · ' + esc(nomeEmp(r.empresaId)) : ''}</small></div></li>`;
    }).join('');
    el.innerHTML = `
      ${S.semIndice ? `<div class="banner warn" id="hs-indice">${ic('alert')}<span><strong>Histórico mostrado sem a ordem do banco</strong>Falta criar o índice do histórico no Firebase (ver README). Enquanto isso, mostramos os registros mais recentes que encontramos.</span></div>` : ''}
      ${S.erro ? `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível carregar o histórico.</strong>${esc(S.erro)}</span></div>` : ''}
      <section class="card" id="hs"><div class="card-h hs-filtros">
        ${master ? `<label class="f"><span>Empresa</span><select class="sel" id="hs-emp"><option value="">Todas as empresas</option><option value="master" ${S.emp === 'master' ? 'selected' : ''}>Equipe Conectwork</option>${(S.empresas || []).map(e => `<option value="${esc(e._id)}" ${S.emp === e._id ? 'selected' : ''}>${esc(e.nome || e.razao)}</option>`).join('')}</select></label>` : ''}
        <label class="f"><span>Pessoa</span><select class="sel" id="hs-pessoa"><option value="">Todas as pessoas</option>${pessoas.map(([u, n]) => `<option value="${esc(u)}" ${S.pessoa === u ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f"><span>Assunto</span><select class="sel" id="hs-assunto"><option value="">Todos</option>${ASSUNTOS.map(([k, n]) => `<option value="${k}" ${S.assunto === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f hs-busca"><span>Buscar</span><input id="hs-busca" type="search" placeholder="Nome, e-mail ou o que foi feito" value="${esc(S.busca)}"></label>
      </div>
      ${lista.length ? `<ul class="feed hs-lista" id="hs-lista">${linhas}</ul>` : `<div class="empty"><div class="ic">${ic('clock')}</div><strong>${S.regs.length ? 'Nada encontrado com esses filtros.' : 'Nada registrado ainda.'}</strong>${S.regs.length ? '<span>Tire algum filtro ou mude a busca.</span>' : ''}</div>`}
      <div class="hs-rodape"><span class="hint" id="hs-conta">${lista.length} de ${S.regs.length} registros carregados</span>
        ${S.temMais ? `<button class="btn sec sm" id="hs-mais" ${S.carregando ? 'disabled' : ''}>Mostrar mais antigos</button>` : ''}</div></section>
      <p class="hint" style="margin:14px 0 0;font-size:12.5px">O histórico não pode ser editado nem apagado. Ele mostra só nome e e-mail das pessoas (LGPD).</p>`;
    const re = () => desenhar(el, ctx);
    const em = document.getElementById('hs-emp'); if (em) em.onchange = async () => { S.emp = em.value; S.pessoa = ''; S.regs = null; S.limite = PASSO; re(); await buscar(ctx); re(); };
    document.getElementById('hs-pessoa').onchange = e => { S.pessoa = e.target.value; re(); };
    document.getElementById('hs-assunto').onchange = e => { S.assunto = e.target.value; re(); };
    const bq = document.getElementById('hs-busca');
    bq.oninput = () => { S.busca = bq.value; clearTimeout(bq._t); bq._t = setTimeout(() => { const pos = bq.selectionStart; re(); const n = document.getElementById('hs-busca'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* nada */ } }, 250); };
    const mais = document.getElementById('hs-mais'); if (mais) mais.onclick = async () => { S.limite += PASSO; mais.disabled = true; await buscar(ctx); re(); };
  }

  CW.registrarModulo({
    id: 'historico', nome: 'Histórico de alterações', nomeCurto: 'Histórico', icone: 'clock', ordem: 90,
    para: ['empresa', 'master'], soAdmin: true,
    telas: {
      lista: {
        nome: 'Histórico de alterações', sub: 'Quem fez o quê e quando. Nada aqui pode ser editado ou apagado.',
        async render(el, ctx) {
          S = novo(); desenhar(el, ctx);
          if (ctx.contexto.tipo === 'master') await empresasMaster();
          await buscar(ctx); desenhar(el, ctx);
        }
      }
    }
  });
})();
