/* Conectwork · Cadastro rápido do MEI (10/11/2026, docs/PLANO-MEI.md).
   Uma tela só: o acesso (nome, e-mail e senha, se ainda não entrou) e o negócio (CNPJ, nome do negócio, o que faz,
   segmento, cidade/UF) e as autorizações. A empresa nasce com status 'mei' e porte MEI: já usa a gestão do próprio
   negócio (Início, Dinheiro, Agenda, Assistente, Meu negócio). Não aparece para a rede nem pode ser contratada; para
   receber demandas, completa o cadastro em "Meu cadastro" (vai para a análise da equipe, com os documentos).
   Abre pelo "Sou MEI" na tela de entrar e na tela de quem entrou sem empresa. */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const C = () => CW.cadastro;
  const RASC = 'cw.mei.rasc';
  const SEGMENTOS = ['Serviços', 'Comércio', 'Alimentação', 'Beleza e estética', 'Construção e reformas', 'Artesanato', 'Produção', 'Transporte e entregas', 'Outro'];
  const ATIVIDADES = ['Eletricista', 'Encanador', 'Pedreiro', 'Pintor', 'Diarista', 'Cabeleireira', 'Manicure', 'Confeiteira', 'Marmita e refeições', 'Costureira', 'Mecânico', 'Motorista', 'Entregador',
    'Técnico de informática', 'Designer', 'Professor particular', 'Fotógrafo', 'Artesã', 'Revendedora', 'Vendedor ambulante', 'Jardineiro', 'Personal trainer'];
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  let F = null, enviando = false;   /* F: o que a pessoa preencheu (sem a senha) */

  const usuario = () => CW.fb.auth().currentUser;
  const aberto = () => { try { return sessionStorage.getItem(RASC + '.aberto') === '1'; } catch (e) { return false; } };
  const marcar = v => { try { if (v) sessionStorage.setItem(RASC + '.aberto', '1'); else sessionStorage.removeItem(RASC + '.aberto'); } catch (e) { /* sem armazenamento */ } };
  const guardar = () => { try { sessionStorage.setItem(RASC, JSON.stringify(F)); } catch (e) { /* sem armazenamento */ } };
  function vazio() {
    const cons = {}; (C() ? C().AUTORIZACOES : []).forEach(a => { cons[a.k] = a.obrig ? false : !!a.padrao; });
    return { nome: '', email: '', cnpj: '', negocio: '', atividade: '', segmento: '', cidade: '', uf: 'RS', cons, termos: false };
  }

  function abrir() {
    let r = null; try { r = JSON.parse(sessionStorage.getItem(RASC) || 'null'); } catch (e) { /* nada */ }
    F = Object.assign(vazio(), r || {});
    const u = usuario(), s = CW.sessao && CW.sessao.estado();
    if (u) { F.email = (u.email || '').toLowerCase(); if (!F.nome) F.nome = (s && s.perfil && s.perfil.nome) || u.displayName || ''; }
    marcar(true); desenhar();
  }

  function desenhar(erros, msg) {
    const { esc, ic, LOGO } = U(), u = usuario(), e = erros || {};
    const campo = (id, rot, html, w, dica) => `<label class="f ${w || 'c12'}${e[id] ? ' tem-erro' : ''}"><span>${rot}</span>${html}${e[id] ? `<em class="ferr" id="mc-e-${id}">${esc(e[id])}</em>` : dica ? `<em class="hint">${esc(dica)}</em>` : ''}</label>`;
    const auts = (C() ? C().AUTORIZACOES : []).map(a => `<label class="check"><input type="checkbox" data-cons="${a.k}" ${F.cons[a.k] ? 'checked' : ''}><span>${esc(a.t)}${a.obrig ? ' <b aria-hidden="true">*</b>' : ''}${a.s ? `<small>${esc(a.s)}</small>` : ''}</span></label>`).join('');
    document.documentElement.classList.remove('entrada', 'casca'); document.documentElement.classList.add('wizpg');
    document.getElementById('app').innerHTML = `<div class="mcad" id="mei-cad">
      <header class="mcad-topo"><span class="mcad-logo">${LOGO(34)}<b>Conect<span>work</span></b></span><button type="button" class="btn sec sm" id="mc-sair">${u ? 'Sair' : 'Voltar'}</button></header>
      <form id="mc-form" novalidate class="mcad-form">
        <div class="mcad-head"><span class="mcad-tag">${ic('star')}Para quem é MEI</span><h1>Comece a organizar o seu negócio</h1>
          <p class="sub">Leva 2 minutos e é de graça. Depois, se quiser receber pedidos de empresas pelo Conectwork, você completa o cadastro com os documentos.</p></div>
        ${msg ? `<div class="banner danger" role="alert" id="mc-erro">${ic('alert')}<span>${esc(msg)}</span></div>` : Object.keys(e).length ? `<div class="banner danger" role="alert" id="mc-erro">${ic('alert')}<span>Confira ${Object.keys(e).length === 1 ? 'o campo marcado' : 'os campos marcados'}.</span></div>` : ''}
        ${u ? '' : `<section class="card"><div class="card-h"><span class="ic">${ic('user')}</span><h3>Seu acesso</h3></div><div class="card-b fgrid">
          ${campo('nome', 'Seu nome completo', `<input id="mc-nome" autocomplete="name" maxlength="120" value="${esc(F.nome)}">`)}
          ${campo('email', 'E-mail', `<input id="mc-email" type="email" autocomplete="email" maxlength="120" value="${esc(F.email)}">`, 'c12', 'Vai ser o seu login.')}
          ${campo('senha', 'Crie uma senha', `<input id="mc-senha" type="password" autocomplete="new-password" maxlength="100">`, 'c12', '8 ou mais caracteres, com letras e números.')}
          <p class="hint c12" style="margin:0">Já tem login? <button type="button" class="linkbtn" id="mc-login">Entre primeiro</button> e depois toque em "Sou MEI".</p></div></section>`}
        <section class="card"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Seu MEI</h3></div><div class="card-b fgrid">
          ${campo('cnpj', 'CNPJ do MEI', `<input id="mc-cnpj" data-mascara="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" value="${esc(F.cnpj)}">`, 'c6')}
          ${campo('negocio', 'Nome do negócio <i>(opcional)</i>', `<input id="mc-negocio" maxlength="80" value="${esc(F.negocio)}" placeholder="Ex.: Lia Doces">`, 'c6')}
          ${campo('atividade', 'O que você faz', `<input id="mc-atividade" list="mc-ativs" maxlength="80" value="${esc(F.atividade)}" placeholder="Ex.: Eletricista"><datalist id="mc-ativs">${ATIVIDADES.map(a => `<option value="${esc(a)}">`).join('')}</datalist>`)}
          <div class="f c12${e.segmento ? ' tem-erro' : ''}"><span>Seu ramo</span><div class="mcad-chips" role="group" aria-label="Seu ramo">${SEGMENTOS.map(sg => `<button type="button" class="mcad-chip" data-seg="${esc(sg)}" aria-pressed="${F.segmento === sg}">${esc(sg)}</button>`).join('')}</div>${e.segmento ? `<em class="ferr">${esc(e.segmento)}</em>` : ''}</div>
          ${campo('cidade', 'Cidade', `<input id="mc-cidade" maxlength="80" autocomplete="address-level2" value="${esc(F.cidade)}">`, 'c8')}
          ${campo('uf', 'UF', `<select id="mc-uf">${UFS.map(x => `<option ${x === F.uf ? 'selected' : ''}>${x}</option>`).join('')}</select>`, 'c4')}
        </div></section>
        <section class="card"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Autorizações</h3></div><div class="card-b stack" style="gap:10px">
          ${auts}
          <label class="check${e.termos ? ' tem-erro' : ''}"><input type="checkbox" id="mc-termos" ${F.termos ? 'checked' : ''}><span>Li e aceito os Termos de uso e a Política de privacidade <b aria-hidden="true">*</b></span></label>
          ${e.termos ? `<em class="ferr">${esc(e.termos)}</em>` : ''}
          <p class="hint" style="margin:0;font-size:12px">${esc(C() ? C().AVISO : '')}</p></div></section>
        <button type="submit" class="btn mcad-ir" id="mc-enviar" ${enviando ? 'disabled' : ''}>${enviando ? 'Preparando o seu Conectwork…' : ic('arrow') + 'Começar a usar'}</button>
      </form></div>`;
    ligar();
  }

  function ler() {
    const g = id => { const x = document.getElementById(id); return x ? x.value.trim() : ''; };
    if (!usuario()) { F.nome = g('mc-nome').replace(/\s+/g, ' '); F.email = g('mc-email').toLowerCase(); }
    F.cnpj = g('mc-cnpj'); F.negocio = g('mc-negocio').replace(/\s+/g, ' '); F.atividade = g('mc-atividade').replace(/\s+/g, ' ');
    F.cidade = g('mc-cidade').replace(/\s+/g, ' '); F.uf = g('mc-uf') || 'RS';
    document.querySelectorAll('[data-cons]').forEach(c => { F.cons[c.dataset.cons] = c.checked; });
    const t = document.getElementById('mc-termos'); F.termos = !!(t && t.checked);
    guardar();
  }
  function validar(senha) {
    const e = {}, ui = U();
    if (!usuario()) {
      if (F.nome.length < 3 || !/\s/.test(F.nome)) e.nome = 'Escreva o nome e o sobrenome.';
      if (!ui.validarEmail(F.email)) e.email = 'Escreva um e-mail válido.';
      if (!C().senhaOk(senha)) e.senha = 'A senha precisa de 8 ou mais caracteres, com letras e números.';
    }
    if (!ui.validarCNPJ(F.cnpj)) e.cnpj = ui.dig(F.cnpj).length ? 'CNPJ inválido. Confira os números (está no seu Certificado do MEI).' : 'Escreva o CNPJ do MEI.';
    if (F.atividade.length < 3) e.atividade = 'Conte o que você faz, por exemplo "Eletricista".';
    if (!F.segmento) e.segmento = 'Escolha o seu ramo.';
    if (F.cidade.length < 2) e.cidade = 'Escreva a cidade.';
    if (C().AUTORIZACOES.some(a => a.obrig && !F.cons[a.k]) || !F.termos) e.termos = 'Para usar o Conectwork, marque as autorizações com * e aceite os termos.';
    return e;
  }

  async function enviar() {
    ler();
    const senhaEl = document.getElementById('mc-senha'), senha = senhaEl ? senhaEl.value : '', e = validar(senha);
    if (Object.keys(e).length) { desenhar(e); const p = document.querySelector('.tem-erro input, .tem-erro select'); if (p) p.focus(); return; }
    enviando = true; desenhar();
    const db = CW.fb.db(), agora = CW.fb.agora, num = U().dig(F.cnpj);
    let u = usuario();
    try {
      if (!u) {
        const cred = await CW.fb.auth().createUserWithEmailAndPassword(F.email, senha); u = cred.user;
        await db.doc('usuarios/' + u.uid).set({ nome: F.nome, email: F.email, criadoEm: agora(), atualizadoEm: agora() });
        try { await u.sendEmailVerification((window.CONECTWORK_CONFIG || {}).urlApp ? { url: window.CONECTWORK_CONFIG.urlApp } : undefined); } catch (x) { console.warn('confirmação de e-mail não enviada', x); }
      }
      const nomePessoa = F.nome || u.displayName || u.email, nomeNeg = F.negocio || nomePessoa, empRef = db.collection('empresas').doc(), id = empRef.id;
      let protocolo = '';
      await db.runTransaction(async tx => {
        const cRef = db.doc('contadores/protocolo'), nRef = db.doc('cnpjs/' + num);
        const c = await tx.get(cRef), n = await tx.get(nRef);
        if (n.exists) { const er = new Error('cnpj'); er.code = 'cw/cnpj-repetido'; throw er; }
        const ano = new Date().getFullYear(), at = c.exists ? c.data() : null, seq = at && at.ano === ano ? at.n + 1 : 1;
        protocolo = `CW-${ano}-${String(seq).padStart(4, '0')}`;
        tx.set(cRef, { ano, n: seq }); tx.set(nRef, { empresaId: id, criadoEm: agora() });
        tx.set(empRef, { tipo: 'prestador', status: 'mei', nome: nomeNeg, razao: '', cnpj: F.cnpj, cnpjNum: num, cidade: F.cidade, uf: F.uf, protocolo, criadoPor: u.uid, criadoEm: agora(), enviadoEm: agora() });
        tx.set(db.doc('empresas/' + id + '/privado/cadastro'), { dados: { porte: 'MEI', atividade: F.atividade, segmento: F.segmento }, end: { cidade: F.cidade, uf: F.uf }, resp: { nome: nomePessoa, email: (u.email || F.email).toLowerCase() },
          banco: {}, docs: {}, meiRapido: true, aceites: { verdade: true, termos: true, versao: C().VERSAO_TEXTOS } });
        tx.set(db.doc('acessos/' + id + '_' + u.uid), { uid: u.uid, empresaId: id, nome: nomePessoa, email: (u.email || F.email).toLowerCase(), cargo: 'admin', extras: [], sem: [], ativo: true, criadoEm: agora() });
        C().AUTORIZACOES.forEach(a => { const reg = { uid: u.uid, finalidade: a.k, aceite: !!F.cons[a.k], texto: a.t, textoVersao: C().VERSAO_TEXTOS, canal: 'cadastro-mei', em: agora() };
          tx.set(db.doc('consentimentos/' + u.uid + '_' + a.k), reg); tx.set(db.collection('consentimentos_log').doc(), reg); });
        tx.set(db.collection('log').doc(), { em: agora(), uid: u.uid, quem: nomePessoa, empresaId: id, acao: 'empresa.mei', texto: `Cadastro rápido do MEI ${nomeNeg} (protocolo ${protocolo}): ${F.atividade}, ${F.segmento}, ${F.cidade}/${F.uf}.`, ref: id });
      });
      try { sessionStorage.setItem('cw.porte.' + id, 'MEI'); sessionStorage.removeItem(RASC); } catch (x) { /* sem armazenamento */ }
      marcar(false); enviando = false; F = null;
      U().toast('Pronto! O seu Conectwork está pronto para usar.');
      await CW.sessao.recarregar();
    } catch (er) {
      enviando = false;
      if (er && er.code === 'cw/cnpj-repetido') desenhar({ cnpj: 'Este CNPJ já tem cadastro no Conectwork. Se o MEI é seu, entre com o login que fez o cadastro ou fale com a equipe Conectwork.' });
      else if (/email-already-in-use/.test(er && er.code)) desenhar({ email: 'Esse e-mail já tem login no Conectwork. Toque em "Entre primeiro" e use a sua senha.' });
      else desenhar(null, 'Não deu para terminar agora. ' + (C().erroConta ? C().erroConta(er) : CW.fb.mensagemErro(er)) + ' O que você preencheu continua aqui.');
    }
  }

  function ligar() {
    U().aplicarMascaras(document.getElementById('mei-cad'));
    document.getElementById('mc-form').onsubmit = ev => { ev.preventDefault(); if (!enviando) enviar(); };
    document.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { ler(); F.segmento = b.dataset.seg; guardar(); document.querySelectorAll('[data-seg]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    document.getElementById('mc-sair').onclick = () => { ler(); marcar(false); if (usuario()) CW.sessao.sair(); else CW.sessao.recarregar(); };
    const l = document.getElementById('mc-login'); if (l) l.onclick = () => { ler(); marcar(false); CW.sessao.telaLogin('login'); };
    const p = document.querySelector('#mei-cad input'); if (p && !enviando) p.focus();
  }

  /* a sessão (js/sessao.js) volta para cá quando a conta acabou de ser criada e a empresa ainda não existe */
  const origAberto = CW.entrada.cadastroAberto, origCont = CW.entrada.continuarCadastro;
  CW.entrada.cadastroAberto = () => aberto() || (origAberto ? origAberto() : false);
  CW.entrada.continuarCadastro = () => { if (aberto()) { if (!F) abrir(); else desenhar(); } else if (origCont) origCont(); };
  CW.entrada.cadastrarMei = abrir;
  CW.cadastroMei = { abrir, SEGMENTOS };
})();
