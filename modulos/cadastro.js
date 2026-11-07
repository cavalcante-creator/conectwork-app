/* Conectwork · Etapa 1, parte 1: cadastro de empresa.
   Começa por "Crie seu acesso" (nome, e-mail, senha forte: cria a conta e manda a confirmação do e-mail;
   pula se a pessoa já estiver logada) e segue as etapas do protótipo (docs/prototipo-referencia.html):
   tipo e dados, endereço, responsável, banco, documentos e revisão com declarações e autorizações.
   - O rascunho fica só neste navegador (localStorage), por pessoa. Nada vai para o banco até o envio.
   - No envio, numa transação só: empresas/{id} (status "analise"), empresas/{id}/privado/cadastro,
     cnpjs/{número} (impede CNPJ repetido), contadores/protocolo (CW-AAAA-0000), o acesso admin do fundador,
     as autorizações (consentimentos + consentimentos_log) e o registro no histórico.
   - Documentos: por enquanto só o nome e o tamanho do arquivo (o envio do arquivo vem numa etapa futura).
     Certificado digital NÃO é pedido aqui: segredo só no servidor (CLAUDE.md, regra de ouro 4).
   - Também registra o módulo "Meu cadastro" (empresa ainda não aprovada), com "Corrigir cadastro". */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;

  const TIPOS = { contratante: 'Só contrata', ambos: 'Contrata e presta', prestador: 'Só presta serviços' };
  const TIPO_DESC = {
    contratante: 'Sua empresa contrata serviços e paga as notas dos prestadores.',
    ambos: 'Sua empresa presta serviços para clientes e também contrata outras empresas.',
    prestador: 'Você presta serviços e emite notas para quem te contrata (ex.: MEI).'
  };
  const TIPO_IC = { contratante: 'wallet', ambos: 'swap', prestador: 'receipt' };
  const PORTES = ['MEI', 'Microempresa (ME)', 'Empresa de pequeno porte (EPP)', 'Demais'];
  const REGIMES = ['MEI (SIMEI)', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real'];
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const BANCOS = ['001 · Banco do Brasil', '033 · Santander', '041 · Banrisul', '077 · Inter', '104 · Caixa Econômica', '237 · Bradesco', '260 · Nu Pagamentos', '336 · C6 Bank', '341 · Itaú Unibanco', '748 · Sicredi', '756 · Sicoob', 'Outro'];
  const CONTAS = ['Corrente', 'Pagamento', 'Poupança'];
  const PIXT = ['CNPJ', 'E-mail', 'Celular', 'Chave aleatória'];
  const PASSOS = [['Tipo e empresa', 'Dados da empresa'], ['Endereço', 'Sede da empresa'], ['Responsável', 'Quem responde pela conta'],
    ['Dados bancários', 'Conta para pagar e receber'], ['Documentos', 'Arquivos para conferência'], ['Revisão', 'Conferir e enviar']];
  const MAX_ARQ = 10 * 1024 * 1024;

  /* Autorizações separadas (CLAUDE.md, consentimentos). As três primeiras são necessárias para usar o Conectwork;
     WhatsApp e e-mail vêm marcados e podem ser desmarcados; cursos e ofertas vêm DESMARCADOS. */
  const VERSAO_TEXTOS = '2026-11-v1';
  const AUTORIZACOES = [
    { k: 'operacional', obrig: true, t: 'Usar os dados do cadastro para analisar a empresa e operar a plataforma.' },
    { k: 'contrato', obrig: true, t: 'Registrar contratos, ordens de serviço, entregas e medições da empresa.' },
    { k: 'cobranca', obrig: true, t: 'Registrar notas, pagamentos e cobranças entre a empresa e quem ela contrata ou atende.' },
    { k: 'whatsapp', padrao: true, t: 'Receber avisos do Conectwork pelo WhatsApp.', s: 'Avisos sobre o uso da plataforma, como cadastro aprovado e nota recebida.' },
    { k: 'email', padrao: true, t: 'Receber avisos do Conectwork por e-mail.', s: 'Os mesmos avisos, por e-mail.' },
    { k: 'cursos', padrao: false, t: 'Receber convites para cursos e capacitações.', s: 'Opcional. Dá para mudar quando quiser.' },
    { k: 'ofertas', padrao: false, t: 'Receber ofertas do clube de parceiros do Conectwork.', s: 'Opcional. Dá para mudar quando quiser.' }
  ];
  const AVISO = 'O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.';

  const isMEI = d => String((d.dados || {}).porte || '').startsWith('MEI');
  function docsReq(d) {
    return [
      ['contrato', isMEI(d) ? 'Certificado da Condição de MEI (CCMEI)' : 'Contrato social ou última alteração consolidada', true],
      ['cartao', 'Cartão CNPJ (comprovante de inscrição)', true],
      ['endereco', 'Comprovante de endereço da empresa', true],
      ['identidade', 'Documento com foto do responsável legal', true]
    ];
  }

  /* ---------- estado ---------- */
  let W = null;                                         /* { passo: 'acesso' | 0..5, d, err, edit, enviando, fim, msg } */
  const FLAG = 'cw.cadastrando';
  const usuario = () => CW.fb.auth().currentUser;
  const chaveRasc = () => 'cw.cad.' + (usuario() ? usuario().uid : 'novo');
  const vazio = () => ({ tipo: '', acesso: {}, dados: {}, end: {}, resp: {}, banco: {}, docs: {}, aceite: {}, cons: {} });
  function guardar() {
    if (!W || W.edit || W.fim) return;
    const d = JSON.parse(JSON.stringify(W.d)); delete d.acesso.senha; delete d.acesso.senha2;
    try { localStorage.setItem(chaveRasc(), JSON.stringify({ passo: W.passo, d })); } catch (e) { /* sem armazenamento: o rascunho vale só nesta visita */ }
  }
  function lerRasc() { try { const r = JSON.parse(localStorage.getItem(chaveRasc()) || 'null'); return r && r.d ? r : null; } catch (e) { return null; } }
  function apagarRasc() { try { localStorage.removeItem(chaveRasc()); localStorage.removeItem('cw.cad.novo'); } catch (e) { /* nada */ } }
  const aberto = () => { try { return sessionStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };
  const marcar = on => { try { if (on) sessionStorage.setItem(FLAG, '1'); else sessionStorage.removeItem(FLAG); } catch (e) { /* nada */ } };

  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] || {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };

  /* ---------- começar / continuar / sair ---------- */
  function comecar() {
    const u = usuario();
    marcar(true);
    const r = lerRasc() || (u ? (() => { try { return JSON.parse(localStorage.getItem('cw.cad.novo') || 'null'); } catch (e) { return null; } })() : null);
    const d = Object.assign(vazio(), r ? r.d : {});
    AUTORIZACOES.forEach(a => { if (!(a.k in d.cons)) d.cons[a.k] = a.obrig ? false : !!a.padrao; });
    W = { passo: u ? (r && typeof r.passo === 'number' ? r.passo : 0) : 'acesso', d, err: {}, edit: null };
    if (u) preencherDoLogin();
    desenhar();
  }
  function preencherDoLogin() {
    const u = usuario(), s = CW.sessao.estado(), d = W.d;
    if (!d.resp.email && u) d.resp.email = (u.email || '').toLowerCase();
    if (!d.resp.nome) d.resp.nome = (s.perfil && s.perfil.nome) || d.acesso.nome || '';
  }
  /* chamado pela sessão quando o login muda e a pessoa ainda não tem empresa (ex.: logo depois de criar a conta) */
  function continuar() { if (!W) comecar(); else desenhar(); }

  async function cancelar() {
    const sim = W.edit ? await U().confirmar('Sair sem reenviar?', 'As correções feitas agora não serão guardadas.', 'Sair')
      : await U().confirmar('Sair do cadastro?', 'O que você já preencheu fica guardado neste aparelho para continuar depois.', 'Sair');
    if (!sim) return;
    guardar(); W = null; marcar(false);
    CW.sessao.recarregar();
  }

  /* ---------- campos ---------- */
  function campo(p, rotulo, o) {
    o = o || {};
    const { esc } = U(), v = getP(W.d, p) ?? '', e = W.err[p];
    const ctl = o.opts
      ? `<select data-p="${p}" id="cad-${p.replace('.', '-')}" ${o.dis ? 'disabled' : ''}><option value="">Selecione</option>${o.opts.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`
      : `<input data-p="${p}" id="cad-${p.replace('.', '-')}" type="${o.type || 'text'}" value="${esc(v)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.mask ? `data-mascara="${o.mask}"` : ''} ${o.im ? `inputmode="${o.im}"` : ''} autocomplete="${o.ac || 'off'}" ${o.dis ? 'disabled' : ''} ${o.max ? `maxlength="${o.max}"` : ''}>`;
    return `<label class="f c${o.w || 6} ${e ? 'has-err' : ''}"><span>${rotulo}${o.opc ? ' <i>(opcional)</i>' : ' <b aria-hidden="true">*</b>'}</span>${ctl}${e ? `<em class="ferr">${esc(e)}</em>` : o.dica ? `<em class="hint">${esc(o.dica)}</em>` : ''}</label>`;
  }

  /* senha forte: 8 ou mais caracteres, com letra e número (3 níveis no medidor) */
  function forcaSenha(s) { s = s || ''; let n = 0; if (s.length >= 8) n++; if (/[a-zA-Z]/.test(s) && /\d/.test(s)) n++; if (s.length >= 12 || /[^a-zA-Z0-9]/.test(s)) n++; return s ? Math.max(1, n) : 0; }
  const senhaOk = s => String(s || '').length >= 8 && /[a-zA-Z]/.test(s) && /\d/.test(s);

  function corpo() {
    const d = W.d, { esc, ic } = U();
    if (W.passo === 'acesso') {
      const f = forcaSenha(d.acesso.senha);
      return `<div class="fgrid">
        ${campo('acesso.nome', 'Seu nome completo', { w: 12, ac: 'name' })}
        ${campo('acesso.email', 'Seu e-mail', { w: 12, type: 'email', ac: 'email', ph: 'voce@empresa.com.br', dica: 'Será o seu login no Conectwork. Vamos mandar um link para confirmar.' })}
        <label class="f c6 ${W.err['acesso.senha'] ? 'has-err' : ''}"><span>Crie uma senha <b aria-hidden="true">*</b></span>
          <span class="lg-pw"><input data-p="acesso.senha" id="cad-acesso-senha" type="password" autocomplete="new-password" value="${esc(d.acesso.senha || '')}"><button type="button" class="lg-olho" data-olho="cad-acesso-senha" aria-label="Mostrar a senha" aria-pressed="false">${ic('eye')}</button></span>
          <span class="senha-forca n${f}" id="cad-forca" aria-hidden="true"><i></i><i></i><i></i></span>
          ${W.err['acesso.senha'] ? `<em class="ferr">${esc(W.err['acesso.senha'])}</em>` : '<em class="hint">Mínimo de 8 caracteres, com letras e números.</em>'}</label>
        <label class="f c6 ${W.err['acesso.senha2'] ? 'has-err' : ''}"><span>Repita a senha <b aria-hidden="true">*</b></span>
          <input data-p="acesso.senha2" id="cad-acesso-senha2" type="password" autocomplete="new-password" value="${esc(d.acesso.senha2 || '')}">
          ${W.err['acesso.senha2'] ? `<em class="ferr">${esc(W.err['acesso.senha2'])}</em>` : ''}</label>
      </div>`;
    }
    switch (W.passo) {
      case 0: return `<div class="fgrid">
        <div class="fsec">Como sua empresa vai usar o Conectwork</div>
        <div class="c12"><div class="optc" role="radiogroup" aria-label="Tipo de uso">${Object.keys(TIPOS).map(k => `<button type="button" class="opt ${W.err.tipo ? 'has-err' : ''}" role="radio" aria-checked="${d.tipo === k}" data-tipo="${k}"><span class="oi">${ic(TIPO_IC[k])}</span><strong>${TIPOS[k]}</strong><small>${TIPO_DESC[k]}</small></button>`).join('')}</div>
          ${W.err.tipo ? `<em class="ferr" style="font-size:12px;font-style:normal">${esc(W.err.tipo)}</em>` : ''}</div>
        <div class="fsec">Identificação</div>
        ${campo('dados.cnpj', 'CNPJ', { w: 4, mask: 'cnpj', ph: '00.000.000/0000-00', dis: !!W.edit, dica: W.edit ? 'O CNPJ não muda. Se estiver errado, fale com a equipe Conectwork.' : '' })}
        ${campo('dados.abertura', 'Data de abertura', { w: 4, type: 'date' })}
        ${campo('dados.porte', 'Porte', { w: 4, opts: PORTES })}
        ${campo('dados.razao', 'Razão social', { w: 8, ac: 'organization', max: 150 })}
        ${campo('dados.fantasia', 'Nome fantasia', { w: 4, max: 80 })}
        <div class="fsec">Informações fiscais</div>
        ${campo('dados.regime', 'Regime tributário', { w: 4, opts: REGIMES })}
        ${campo('dados.cnae', 'CNAE principal', { w: 8, ph: '0000-0/00 · descrição da atividade', max: 160 })}
        ${campo('dados.im', 'Inscrição municipal', { w: 6, opc: d.tipo === 'contratante', dica: d.tipo === 'contratante' ? '' : 'Necessária para emitir nota de serviço', max: 30 })}
        ${campo('dados.ie', 'Inscrição estadual', { w: 6, opc: true, dica: 'Deixe em branco se for isenta', max: 30 })}
      </div>`;
      case 1: return `<div class="fgrid">
        ${campo('end.cep', 'CEP', { w: 3, mask: 'cep', ph: '00000-000' })}
        ${campo('end.logradouro', 'Logradouro', { w: 9, ph: 'Rua, avenida…', ac: 'address-line1', max: 150 })}
        ${campo('end.numero', 'Número', { w: 3, max: 20 })}
        ${campo('end.compl', 'Complemento', { w: 4, opc: true, ph: 'Sala, andar, bloco', max: 80 })}
        ${campo('end.bairro', 'Bairro', { w: 5, max: 80 })}
        ${campo('end.cidade', 'Cidade', { w: 9, max: 80 })}
        ${campo('end.uf', 'UF', { w: 3, opts: UFS })}
      </div>`;
      case 2: return `<div class="fgrid">
        <div class="fsec">Responsável legal</div>
        ${campo('resp.nome', 'Nome completo', { w: 8, ac: 'name', max: 120 })}
        ${campo('resp.cpf', 'CPF', { w: 4, mask: 'cpf', ph: '000.000.000-00' })}
        ${campo('resp.cargo', 'Cargo', { w: 6, ph: 'Ex.: Sócio-administrador', max: 80 })}
        ${campo('resp.cel', 'Celular', { w: 6, mask: 'celular', im: 'tel', ph: '(00) 00000-0000', ac: 'tel' })}
        <div class="fsec">Contato</div>
        ${campo('resp.email', 'E-mail do responsável', { w: 6, type: 'email', ac: 'email', max: 120 })}
        ${campo('resp.emailFin', 'E-mail financeiro', { w: 6, type: 'email', opc: true, dica: 'Recebe cópia das notas e cobranças', max: 120 })}
      </div>`;
      case 3: return `<div class="banner info">${ic('bank')}<span>A conta precisa estar no CNPJ da empresa. Ela aparece para quem vai pagar a sua empresa. O dinheiro não passa pelo Conectwork: vai direto de quem paga para quem recebe.</span></div>
        <div class="fgrid">
        ${campo('banco.banco', 'Banco', { w: 6, opts: BANCOS })}
        ${campo('banco.tipoConta', 'Tipo de conta', { w: 6, opts: CONTAS })}
        ${campo('banco.agencia', 'Agência', { w: 4, im: 'numeric', ph: '0000', max: 6 })}
        ${campo('banco.conta', 'Conta com dígito', { w: 4, im: 'numeric', ph: '00000-0', max: 20 })}
        <div class="fsec">Chave Pix</div>
        ${campo('banco.pixTipo', 'Tipo de chave', { w: 4, opts: PIXT })}
        ${campo('banco.pix', 'Chave', { w: 8, max: 120 })}
      </div>`;
      case 4: return `<p class="sub" style="margin:0 0 16px">Separe os arquivos em PDF, JPG ou PNG de até 10 MB. A equipe Conectwork confere os documentos antes de aprovar. Nesta etapa do Conectwork fica registrado o nome de cada arquivo; o envio do arquivo em si entra numa próxima versão.</p>
        <div class="stack" style="gap:10px">${docsReq(d).map(([k, l, req]) => {
          const f = d.docs[k], e = W.err['docs.' + k];
          return `<div class="up ${f ? 'ok' : ''} ${e ? 'has-err' : ''}" id="cad-doc-${k}"><span class="ic">${ic(f ? 'check' : 'upload')}</span>
            <div class="t"><strong>${esc(l)}${req ? '' : ' <span class="hint" style="font-weight:400">(opcional)</span>'}</strong><small>${f ? esc(f.nome) + ' · ' + tamanho(f.tam) : e ? `<span class="ferr">${esc(e)}</span>` : 'Nenhum arquivo selecionado'}</small></div>
            <label class="btn sec sm">${f ? 'Trocar' : 'Selecionar'}<input type="file" data-doc="${k}" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label></div>`;
        }).join('')}</div>`;
      case 5: {
        const sec = (t, s, rows) => `<section class="card"><div class="card-h"><h3>${t}</h3><button type="button" class="linkbtn" style="margin-left:auto" data-ir="${s}">${ic('edit')}Editar</button></div><div class="card-b"><dl class="dl">${rows}</dl></div></section>`;
        const r = (k, v, cheio) => `<div class="${cheio ? 'full' : ''}"><dt>${k}</dt><dd>${esc(v) || '—'}</dd></div>`;
        const docs = docsReq(d).filter(([k]) => d.docs[k]).map(([k, l]) => r(l, d.docs[k].nome, 1)).join('');
        const dec = (k, t) => `<label class="check ${W.err['aceite.' + k] ? 'has-err' : ''}"><input type="checkbox" data-aceite="${k}" ${d.aceite[k] ? 'checked' : ''}><span>${t}</span></label>`;
        const aut = a => `<label class="check ${a.obrig ? '' : 'opc'} ${W.err['cons.' + a.k] ? 'has-err' : ''}"><input type="checkbox" data-cons="${a.k}" ${d.cons[a.k] ? 'checked' : ''}><span>${esc(a.t)}${a.obrig ? ' <b style="color:var(--danger);font-weight:500" aria-hidden="true">*</b>' : ''}${a.s ? `<small>${esc(a.s)}</small>` : ''}</span></label>`;
        return `<div class="grid-2">
          ${sec('Empresa', 0, r('Uso', TIPOS[d.tipo], 1) + r('Razão social', d.dados.razao, 1) + r('Nome fantasia', d.dados.fantasia) + r('CNPJ', d.dados.cnpj) + r('Porte', d.dados.porte) + r('Regime', d.dados.regime) + r('CNAE principal', d.dados.cnae, 1) + r('Inscrição municipal', d.dados.im) + r('Inscrição estadual', d.dados.ie || 'Isenta'))}
          <div class="stack">
            ${sec('Endereço', 1, r('Endereço', `${d.end.logradouro || ''}, ${d.end.numero || ''}${d.end.compl ? ' · ' + d.end.compl : ''}`, 1) + r('Bairro', d.end.bairro) + r('CEP', d.end.cep) + r('Cidade', `${d.end.cidade || ''}/${d.end.uf || ''}`, 1))}
            ${sec('Responsável', 2, r('Nome', d.resp.nome, 1) + r('CPF', d.resp.cpf) + r('Cargo', d.resp.cargo) + r('E-mail', d.resp.email, 1) + r('Celular', d.resp.cel))}
          </div>
          ${sec('Dados bancários', 3, r('Banco', d.banco.banco, 1) + r('Agência', d.banco.agencia) + r('Conta', `${d.banco.conta || ''} · ${d.banco.tipoConta || ''}`) + r('Pix', `${d.banco.pixTipo || ''}: ${d.banco.pix || ''}`, 1))}
          ${sec('Documentos', 4, docs)}
        </div>
        <div class="stack" style="gap:10px;margin-top:22px" id="cad-declaracoes">
          <div class="fsec">Declarações</div>
          ${dec('verdade', 'Declaro que as informações são verdadeiras e que tenho poderes para representar a empresa.')}
          ${dec('termos', 'Li e aceito os <button type="button" class="linkbtn" data-texto="termos">Termos de uso</button> e a <button type="button" class="linkbtn" data-texto="privacidade">Política de privacidade</button> do Conectwork.')}
          <div class="fsec" style="margin-top:8px">Autorizações</div>
          <p class="hint" style="margin:-4px 0 0;font-size:12.5px">Cada autorização é registrada separada, com data e versão do texto. As opcionais dá para mudar quando quiser.</p>
          ${AUTORIZACOES.map(aut).join('')}
          <p class="hint" style="margin:6px 0 0;font-size:12px">${esc(AVISO)}</p>
        </div>`;
      }
    }
    return '';
  }
  const tamanho = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  /* ---------- validação ---------- */
  function validar(p) {
    const d = W.d, e = {}, { dig, validarCNPJ, validarCPF, validarEmail, validarCelular, lerData } = U();
    const req = (k, m) => { if (!String(getP(d, k) || '').trim()) e[k] = m || 'Campo obrigatório.'; };
    if (p === 'acesso') {
      req('acesso.nome', 'Informe seu nome completo.');
      if (d.acesso.nome && String(d.acesso.nome).trim().split(/\s+/).length < 2) e['acesso.nome'] = 'Informe nome e sobrenome.';
      if (!validarEmail(d.acesso.email)) e['acesso.email'] = d.acesso.email ? 'Esse e-mail não parece válido. Confira se digitou certo.' : 'Informe seu e-mail.';
      if (!senhaOk(d.acesso.senha)) e['acesso.senha'] = 'A senha precisa ter 8 ou mais caracteres, com letras e números.';
      else if (d.acesso.senha !== d.acesso.senha2) e['acesso.senha2'] = 'As duas senhas não estão iguais.';
    }
    if (p === 0) {
      if (!d.tipo) e.tipo = 'Escolha como a empresa vai usar o Conectwork.';
      if (!W.edit && !validarCNPJ(d.dados.cnpj)) e['dados.cnpj'] = dig(d.dados.cnpj).length ? 'CNPJ inválido. Confira os números.' : 'Informe o CNPJ.';
      const ab = lerData(d.dados.abertura);
      if (!d.dados.abertura) e['dados.abertura'] = 'Informe a data de abertura.';
      else if (!ab) e['dados.abertura'] = 'Data inválida.';
      else if (ab > new Date()) e['dados.abertura'] = 'A data de abertura não pode ser no futuro.';
      req('dados.porte', 'Selecione o porte.'); req('dados.razao', 'Informe a razão social.'); req('dados.fantasia', 'Informe o nome fantasia.');
      req('dados.regime', 'Selecione o regime tributário.');
      if (dig(d.dados.cnae).length < 7) e['dados.cnae'] = 'Informe o código do CNAE (7 números) e a atividade.';
      if (d.tipo && d.tipo !== 'contratante') req('dados.im', 'Informe a inscrição municipal.');
      if (isMEI(d) && d.dados.regime && d.dados.regime !== 'MEI (SIMEI)') e['dados.regime'] = 'Empresa MEI usa o regime MEI (SIMEI).';
      if (!isMEI(d) && d.dados.regime === 'MEI (SIMEI)') e['dados.regime'] = 'O regime MEI (SIMEI) é só para empresas de porte MEI.';
    }
    if (p === 1) {
      if (dig(d.end.cep).length !== 8) e['end.cep'] = d.end.cep ? 'O CEP precisa ter 8 números.' : 'Informe o CEP.';
      req('end.logradouro', 'Informe o logradouro.'); req('end.numero', 'Informe o número (ou "s/n").'); req('end.bairro', 'Informe o bairro.'); req('end.cidade', 'Informe a cidade.'); req('end.uf', 'Selecione a UF.');
    }
    if (p === 2) {
      req('resp.nome', 'Informe o nome completo.');
      if (!validarCPF(d.resp.cpf)) e['resp.cpf'] = dig(d.resp.cpf).length ? 'CPF inválido. Confira os números.' : 'Informe o CPF.';
      req('resp.cargo', 'Informe o cargo.');
      if (!validarCelular(d.resp.cel)) e['resp.cel'] = d.resp.cel ? 'Celular inválido. Use DDD + 9 dígitos, começando com 9.' : 'Informe o celular com DDD.';
      if (!validarEmail(d.resp.email)) e['resp.email'] = 'Informe um e-mail válido.';
      if (d.resp.emailFin && !validarEmail(d.resp.emailFin)) e['resp.emailFin'] = 'Esse e-mail não parece válido.';
    }
    if (p === 3) {
      req('banco.banco', 'Selecione o banco.'); req('banco.tipoConta', 'Selecione o tipo de conta.');
      if (dig(d.banco.agencia).length < 4) e['banco.agencia'] = 'A agência tem 4 números.';
      if (dig(d.banco.conta).length < 4) e['banco.conta'] = 'Informe a conta com o dígito.';
      req('banco.pixTipo', 'Selecione o tipo de chave.');
      const px = String(d.banco.pix || '').trim();
      if (!px) e['banco.pix'] = 'Informe a chave Pix.';
      else if (d.banco.pixTipo === 'CNPJ' && dig(px) !== dig(d.dados.cnpj)) e['banco.pix'] = 'A chave Pix do tipo CNPJ precisa ser o CNPJ da empresa.';
      else if (d.banco.pixTipo === 'E-mail' && !validarEmail(px)) e['banco.pix'] = 'Essa chave não parece um e-mail.';
      else if (d.banco.pixTipo === 'Celular' && !validarCelular(px)) e['banco.pix'] = 'Use o celular com DDD.';
    }
    if (p === 4) docsReq(d).forEach(([k, , r]) => { if (r && !d.docs[k]) e['docs.' + k] = 'Documento obrigatório.'; });
    if (p === 5) {
      ['verdade', 'termos'].forEach(k => { if (!d.aceite[k]) e['aceite.' + k] = 1; });
      AUTORIZACOES.filter(a => a.obrig).forEach(a => { if (!d.cons[a.k]) e['cons.' + a.k] = 1; });
    }
    return e;
  }

  /* ---------- tela ---------- */
  function desenhar() {
    const { esc, ic, LOGO, CURVES } = U(), el = document.getElementById('app');
    document.documentElement.classList.remove('entrada'); document.documentElement.classList.add('wizpg');
    const lado = (barra, passos) => `<aside class="wiz-side">${CURVES}<div class="logo">${LOGO(32)}<span>Conect<b>work</b></span></div>${barra}${passos}
      <div class="help">Dúvidas no cadastro? Fale com a equipe Conectwork.</div></aside>`;
    if (W.fim) {
      const u = usuario();
      el.innerHTML = `<div class="wiz">${lado('', '')}<section class="wiz-main"><div class="card cad-fim" id="cad-fim"><div class="card-b">
        <span class="avatar lg" style="background:var(--grad)">${ic('check')}</span>
        <h1>${W.edit ? 'Correções enviadas' : 'Cadastro enviado'}</h1>
        <p class="sub" style="margin:0">Protocolo <strong style="color:var(--ink)" id="cad-protocolo">${esc(W.fim)}</strong>. A equipe Conectwork confere os dados e os documentos e avisa o resultado. Enquanto isso, você acompanha tudo em "Meu cadastro".</p>
        ${!W.edit && u && !u.emailVerified ? `<div class="banner info" style="margin:0;width:100%">${ic('mail')}<span><strong>Confirme seu e-mail</strong>Mandamos um link para ${esc(u.email)}. Confira também a caixa de spam.</span></div>` : ''}
        <ul class="tl" style="width:100%"><li class="done"><span class="dot">${ic('check')}</span>${W.edit ? 'Correções enviadas' : 'Cadastro enviado'}<small>${U().formatarData(new Date())}</small></li>
          <li class="now"><span class="dot"></span>Conferência dos dados e documentos<small>em andamento</small></li>
          <li><span class="dot"></span>Aprovação e liberação dos módulos<small>pendente</small></li></ul>
        <button class="btn" id="cad-entrar">${ic('arrow')}Entrar no Conectwork</button></div></div></section></div>`;
      document.getElementById('cad-entrar').onclick = () => { W = null; marcar(false); CW.sessao.recarregar(); };
      window.scrollTo(0, 0);
      return;
    }
    const acesso = W.passo === 'acesso', s = acesso ? -1 : W.passo, n = PASSOS.length;
    const titulo = acesso ? 'Crie seu acesso' : (W.edit ? 'Corrigir cadastro · ' : '') + PASSOS[s][0];
    const sub = acesso ? 'Primeiro, o seu login. Depois vêm os dados da empresa. O cadastro leva cerca de 10 minutos.' : PASSOS[s][1] + '. Campos com * são obrigatórios.';
    const nErr = Object.keys(W.err).length;
    const barra = `<div class="mbar"><span>${acesso ? 'Antes de começar · Crie seu acesso' : `Etapa ${s + 1} de ${n} · ${PASSOS[s][0]}`}</span><div class="track"><i style="width:${acesso ? 4 : (s + 1) / n * 100}%"></i></div></div>`;
    const passos = `<ol class="wsteps">${[['Crie seu acesso', 'Seu login']].concat(PASSOS).map(([t, st], i) => { const j = i - 1, done = j < s || (i === 0 && !acesso), now = j === s;
      return `<li class="${done ? 'done' : now ? 'now' : ''}"><span class="n">${done ? ic('check') : i}</span><span>${t}<small>${st}</small></span></li>`; }).filter((x, i) => i > 0 || !W.edit).join('')}</ol>`;
    const motivo = W.edit && W.motivo ? `<div class="banner warn">${ic('alert')}<span><strong>Ajuste pedido pela equipe Conectwork</strong>${esc(W.motivo)}</span></div>` : '';
    const msgErr = W.msg ? `<div class="banner danger" role="alert" id="cad-erro">${ic('alert')}<span>${esc(W.msg)}</span></div>`
      : nErr ? `<div class="banner danger" role="alert" id="cad-erro">${ic('alert')}<span>${s === 5 ? 'Marque as declarações e as autorizações obrigatórias para enviar.' : `Corrija ${nErr === 1 ? 'o campo destacado' : 'os ' + nErr + ' campos destacados'} para continuar.`}</span></div>` : '';
    const botao = acesso ? `Criar acesso e continuar${ic('arrow')}` : s === n - 1 ? `${ic('send')}${W.edit ? 'Reenviar para análise' : 'Enviar cadastro para análise'}` : `Continuar${ic('arrow')}`;
    el.innerHTML = `<div class="wiz" id="cad">${lado(barra, passos)}
      <section class="wiz-main"><form id="cad-form" novalidate>
        <div class="wiz-head"><div class="t"><div class="stepno">${acesso ? 'Antes de começar' : `Etapa ${s + 1} de ${n}`}</div><h1 id="cad-titulo">${esc(titulo)}</h1><p class="sub">${esc(sub)}</p></div>
          <button type="button" class="btn sec sm" id="cad-sair">${W.edit ? 'Cancelar' : 'Sair'}</button></div>
        ${motivo}${msgErr}
        <div class="card"><div class="card-b" style="padding:24px">${corpo()}</div></div>
        <div class="wiz-foot">${s > 0 ? `<button type="button" class="btn sec" id="cad-voltar">${ic('back')}Voltar</button>` : ''}<span class="grow"></span>
          <button type="submit" class="btn" id="cad-proximo" ${W.enviando ? 'disabled' : ''}>${W.enviando ? 'Enviando…' : botao}</button></div>
        ${acesso ? `<p class="hint" style="margin:16px 0 0;font-size:12.5px">Já tem acesso? <button type="button" class="linkbtn" id="cad-login">Entrar com meu login</button></p>` : ''}
      </form></section></div>`;
    ligar();
  }

  function ligar() {
    const el = document.getElementById('cad'), { aplicarMascaras, ic } = U();
    aplicarMascaras(el);
    el.querySelectorAll('[data-p]').forEach(inp => {
      const h = () => {
        setP(W.d, inp.dataset.p, inp.value);
        if (W.err[inp.dataset.p]) { delete W.err[inp.dataset.p]; const l = inp.closest('label.f'); if (l) { l.classList.remove('has-err'); const m = l.querySelector('.ferr'); if (m) m.remove(); } }
        if (inp.dataset.p === 'acesso.senha') { const f = document.getElementById('cad-forca'); if (f) f.className = 'senha-forca n' + forcaSenha(inp.value); }
        if (inp.dataset.p === 'dados.porte' || inp.dataset.p === 'dados.regime') return;
        guardar();
      };
      inp.addEventListener('input', h); inp.addEventListener('change', () => { h(); guardar(); });
    });
    el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { W.d.tipo = b.dataset.tipo; delete W.err.tipo; guardar(); desenhar(); });
    el.querySelectorAll('[data-olho]').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.olho), m = i.type === 'password';
      i.type = m ? 'text' : 'password'; b.innerHTML = ic(m ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', m ? 'Esconder a senha' : 'Mostrar a senha'); b.setAttribute('aria-pressed', String(m)); });
    el.querySelectorAll('[data-doc]').forEach(inp => inp.onchange = () => {
      const f = inp.files && inp.files[0], k = inp.dataset.doc; if (!f) return;
      if (f.size > MAX_ARQ) { W.err['docs.' + k] = 'Arquivo maior que 10 MB. Diminua ou escolha outro.'; desenhar(); return; }
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { W.err['docs.' + k] = 'Use um arquivo PDF, JPG ou PNG.'; desenhar(); return; }
      W.d.docs[k] = { nome: f.name.slice(0, 120), tam: f.size }; delete W.err['docs.' + k]; guardar(); desenhar();
    });
    el.querySelectorAll('[data-aceite]').forEach(c => c.onchange = () => { W.d.aceite[c.dataset.aceite] = c.checked; delete W.err['aceite.' + c.dataset.aceite]; c.closest('.check').classList.remove('has-err'); guardar(); });
    el.querySelectorAll('[data-cons]').forEach(c => c.onchange = () => { W.d.cons[c.dataset.cons] = c.checked; delete W.err['cons.' + c.dataset.cons]; c.closest('.check').classList.remove('has-err'); guardar(); });
    el.querySelectorAll('[data-texto]').forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); mostrarTexto(b.dataset.texto); });
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { W.passo = +b.dataset.ir; W.err = {}; W.msg = ''; guardar(); desenhar(); window.scrollTo(0, 0); });
    document.getElementById('cad-sair').onclick = cancelar;
    const v = document.getElementById('cad-voltar'); if (v) v.onclick = () => { W.passo--; W.err = {}; W.msg = ''; guardar(); desenhar(); window.scrollTo(0, 0); };
    const lg = document.getElementById('cad-login'); if (lg) lg.onclick = () => { guardar(); W = null; marcar(false); CW.sessao.recarregar(); };
    document.getElementById('cad-form').onsubmit = ev => { ev.preventDefault(); avancar(); };
  }

  function mostrarTexto(qual) {
    U().dialogo({ titulo: qual === 'termos' ? 'Termos de uso' : 'Política de privacidade',
      corpo: `<p style="margin:0">O texto ${qual === 'termos' ? 'dos Termos de uso' : 'da Política de privacidade'} está sendo preparado com o jurídico e será publicado aqui antes do início do uso pelas empresas.</p>
        <p class="hint" style="margin:12px 0 0;font-size:12.5px">Versão registrada no aceite: ${VERSAO_TEXTOS}.</p>` });
  }

  async function avancar() {
    if (W.enviando) return;
    const p = W.passo;
    W.msg = '';
    W.err = validar(p);
    if (Object.keys(W.err).length) { desenhar(); focarErro(); return; }
    if (p === 'acesso') return criarAcesso();
    if (p === 0 && !W.edit) {
      W.enviando = true; desenhar();
      try {
        const num = U().dig(W.d.dados.cnpj);
        const doc = await CW.fb.db().doc('cnpjs/' + num).get();
        W.enviando = false;
        if (doc.exists) { W.err['dados.cnpj'] = 'Este CNPJ já tem cadastro no Conectwork. Se a empresa é sua, peça um convite a quem administra o cadastro dela.'; desenhar(); focarErro(); return; }
      } catch (e) { W.enviando = false; W.msg = CW.fb.mensagemErro(e); desenhar(); return; }
    }
    if (p === PASSOS.length - 1) return enviar();
    W.passo = p + 1; W.err = {}; guardar(); desenhar(); window.scrollTo(0, 0);
    const f = document.querySelector('#cad-form input:not([disabled]):not([type=file]):not([type=checkbox]), #cad-form select'); if (f && W.passo !== 5) f.focus({ preventScroll: true });
  }
  function focarErro() { const e = document.querySelector('#cad .has-err input, #cad .has-err select, #cad .opt.has-err, #cad .check.has-err input, #cad .up.has-err label'); if (e) e.focus(); else window.scrollTo(0, 0); }

  function erroConta(e) {
    const c = e && e.code || '';
    if (/email-already-in-use/.test(c)) return 'Esse e-mail já tem um acesso ao Conectwork. Entre com ele (ou use "Esqueci minha senha") e depois cadastre a empresa.';
    if (/invalid-email/.test(c)) return 'Esse e-mail não parece válido. Confira se digitou certo.';
    if (/weak-password/.test(c)) return 'Essa senha é fraca. Use 8 ou mais caracteres, com letras e números.';
    if (/operation-not-allowed/.test(c)) return 'O cadastro por e-mail e senha não está ligado no Firebase. Avise a equipe Conectwork.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
    if (/network-request-failed/.test(c)) return 'Não foi possível conectar ao servidor. Confira sua internet e tente de novo.';
    return 'Não foi possível criar o acesso agora' + (c ? ' (' + c + ')' : '') + '. Tente de novo em instantes.';
  }

  async function criarAcesso() {
    const a = W.d.acesso, email = String(a.email).trim().toLowerCase(), nome = String(a.nome).trim().replace(/\s+/g, ' ');
    W.enviando = true; desenhar();
    try {
      const cred = await CW.fb.auth().createUserWithEmailAndPassword(email, a.senha);
      const u = cred.user;
      await CW.fb.db().doc('usuarios/' + u.uid).set({ nome, email, criadoEm: CW.fb.agora(), atualizadoEm: CW.fb.agora() });
      try { await u.sendEmailVerification((window.CONECTWORK_CONFIG || {}).urlApp ? { url: window.CONECTWORK_CONFIG.urlApp } : undefined); } catch (e) { console.warn('confirmação de e-mail não enviada', e); }
      const st = CW.sessao.estado(); if (st && st.usuario && st.usuario.uid === u.uid) st.perfil = Object.assign({}, st.perfil, { nome, email });
      delete a.senha; delete a.senha2; a.email = email; a.nome = nome;
      W.enviando = false; W.passo = 0; W.err = {};
      W.d.resp.nome = W.d.resp.nome || nome; W.d.resp.email = W.d.resp.email || email;
      guardar(); try { localStorage.removeItem('cw.cad.novo'); } catch (e) { /* nada */ }
      U().toast('Acesso criado. Agora os dados da empresa.');
      desenhar(); window.scrollTo(0, 0);
    } catch (e) {
      W.enviando = false;
      if (/email-already-in-use/.test(e && e.code)) W.err['acesso.email'] = erroConta(e);
      else if (/weak-password/.test(e && e.code)) W.err['acesso.senha'] = erroConta(e);
      else W.msg = erroConta(e);
      desenhar();
    }
  }

  /* ---------- envio ---------- */
  const limpo = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'string' ? v.trim() : v));

  async function enviar() {
    const db = CW.fb.db(), agora = CW.fb.agora, u = usuario(), d = limpo(W.d), { dig } = U();
    if (!u) { W.msg = 'Sua sessão terminou. Entre de novo para enviar o cadastro.'; desenhar(); return; }
    W.enviando = true; desenhar();
    const st = CW.sessao.estado(), quem = (st.perfil && st.perfil.nome) || d.acesso.nome || u.email;
    const publico = { tipo: d.tipo, nome: d.dados.fantasia, razao: d.dados.razao, cidade: d.end.cidade, uf: d.end.uf };
    const privado = { dados: { abertura: d.dados.abertura, porte: d.dados.porte, regime: d.dados.regime, cnae: d.dados.cnae, im: d.dados.im || '', ie: d.dados.ie || '' },
      end: d.end, resp: Object.assign({}, d.resp, { email: String(d.resp.email || '').toLowerCase(), emailFin: String(d.resp.emailFin || '').toLowerCase() }),
      banco: d.banco, docs: d.docs };
    try {
      if (W.edit) {
        const id = W.edit, b = db.batch();
        b.update(db.doc('empresas/' + id), Object.assign({}, publico, { status: 'analise', enviadoEm: agora() }));
        b.update(db.doc('empresas/' + id + '/privado/cadastro'), Object.assign({}, privado, { reenviadoEm: agora() }));
        b.set(db.collection('log').doc(), { em: agora(), uid: u.uid, quem, empresaId: id, acao: 'empresa.corrigir', texto: `Cadastro de ${publico.nome} corrigido e reenviado para análise.`, ref: id });
        await b.commit();
        W.fim = W.protocolo || 'reenviado';
      } else {
        const num = dig(d.dados.cnpj), empRef = db.collection('empresas').doc(), id = empRef.id;
        let protocolo = '';
        await db.runTransaction(async tx => {
          const cRef = db.doc('contadores/protocolo'), nRef = db.doc('cnpjs/' + num);
          const c = await tx.get(cRef), n = await tx.get(nRef);
          if (n.exists) { const e = new Error('cnpj'); e.code = 'cw/cnpj-repetido'; throw e; }
          const ano = new Date().getFullYear(), atual = c.exists ? c.data() : null;
          const seq = atual && atual.ano === ano ? atual.n + 1 : 1;
          protocolo = `CW-${ano}-${String(seq).padStart(4, '0')}`;
          tx.set(cRef, { ano, n: seq });
          tx.set(nRef, { empresaId: id, criadoEm: agora() });
          tx.set(empRef, Object.assign({}, publico, { status: 'analise', cnpj: d.dados.cnpj, cnpjNum: num, protocolo, criadoPor: u.uid, criadoEm: agora(), enviadoEm: agora() }));
          tx.set(db.doc('empresas/' + id + '/privado/cadastro'), Object.assign({}, privado, { aceites: { verdade: true, termos: true, versao: VERSAO_TEXTOS } }));
          tx.set(db.doc('acessos/' + id + '_' + u.uid), { uid: u.uid, empresaId: id, nome: quem, email: (u.email || '').toLowerCase(), cargo: 'admin', extras: [], sem: [], ativo: true, criadoEm: agora() });
          AUTORIZACOES.forEach(a => {
            const reg = { uid: u.uid, finalidade: a.k, aceite: !!d.cons[a.k], texto: a.t, textoVersao: VERSAO_TEXTOS, canal: 'cadastro', em: agora() };
            tx.set(db.doc('consentimentos/' + u.uid + '_' + a.k), reg);
            tx.set(db.collection('consentimentos_log').doc(), reg);
          });
          tx.set(db.collection('log').doc(), { em: agora(), uid: u.uid, quem, empresaId: id, acao: 'empresa.cadastrar', texto: `Cadastro da empresa ${publico.nome} enviado para análise (protocolo ${protocolo}).`, ref: id });
        });
        W.fim = protocolo;
        apagarRasc();
      }
      W.enviando = false; desenhar();
    } catch (e) {
      W.enviando = false;
      if (e && e.code === 'cw/cnpj-repetido') { W.passo = 0; W.err = { 'dados.cnpj': 'Este CNPJ acabou de ser cadastrado por outra pessoa. Se a empresa é sua, peça um convite a quem fez o cadastro.' }; }
      else W.msg = 'O cadastro não foi enviado. ' + CW.fb.mensagemErro(e) + ' O que você preencheu continua guardado.';
      desenhar();
    }
  }

  /* ---------- corrigir cadastro (empresa com ajuste pedido) ---------- */
  async function corrigir(ctx) {
    const id = ctx.contexto.empresaId, db = CW.fb.db();
    const [e, p] = await Promise.all([db.doc('empresas/' + id).get(), db.doc('empresas/' + id + '/privado/cadastro').get()]);
    const emp = CW.fb.dados(e) || {}, pv = CW.fb.dados(p) || {};
    const d = vazio();
    d.tipo = emp.tipo || '';
    d.dados = Object.assign({}, pv.dados || {}, { cnpj: emp.cnpj || '', razao: emp.razao || '', fantasia: emp.nome || '' });
    d.end = Object.assign({}, pv.end || {}); d.resp = Object.assign({}, pv.resp || {}); d.banco = Object.assign({}, pv.banco || {}); d.docs = Object.assign({}, pv.docs || {});
    d.aceite = { verdade: false, termos: true }; AUTORIZACOES.forEach(a => { d.cons[a.k] = true; });
    CW.app.desmontar();
    W = { passo: 0, d, err: {}, edit: id, motivo: emp.motivo || '', protocolo: emp.protocolo || '' };
    desenhar(); window.scrollTo(0, 0);
  }

  CW.cadastro = { TIPOS, docsReq, tamanho: b => tamanho(b), AUTORIZACOES, VERSAO_TEXTOS, mostrarTexto, AVISO, forcaSenha, senhaOk, erroConta };
  CW.entrada.cadastrarEmpresa = comecar;
  CW.entrada.continuarCadastro = continuar;
  CW.entrada.cadastroAberto = aberto;

  /* ---------- módulo "Meu cadastro" (empresa ainda não aprovada) ---------- */
  const SIT = {
    analise: ['now', 'Conferência dos dados e documentos', 'em andamento'],
    pendencia: ['now', 'Ajuste pedido pela equipe', 'corrija e reenvie'],
    recusado: ['now', 'Cadastro recusado', 'veja o motivo']
  };
  CW.registrarModulo({
    id: 'meucadastro', nome: 'Meu cadastro', icone: 'file', ordem: 2,
    para: ['empresa'], livre: true, semAprovacao: true,
    mostrar: ctx => ctx.empresa && ctx.empresa.status !== 'aprovado',
    telas: {
      situacao: {
        nome: 'Meu cadastro', sub: 'Acompanhe a análise do cadastro da empresa pela equipe Conectwork.',
        async render(el, ctx) {
          const { esc, ic, formatarData } = U(), c = ctx.contexto, db = CW.fb.db();
          const e = CW.fb.dados(await db.doc('empresas/' + c.empresaId).get()) || c.empresa;
          const st = e.status || 'analise', x = SIT[st] || SIT.analise;
          const podeCorrigir = st === 'pendencia' && !ctx.soLeitura && (c.acesso.cargo === 'admin' || e.criadoPor === ctx.sessao.usuario.uid);
          const banner = st === 'pendencia'
            ? `<div class="banner warn" id="mc-motivo">${ic('alert')}<span><strong>A equipe Conectwork pediu um ajuste</strong>${esc(e.motivo || 'Confira os dados e reenvie.')}</span></div>`
            : st === 'recusado' ? `<div class="banner danger" id="mc-motivo">${ic('alert')}<span><strong>O cadastro foi recusado</strong>${esc(e.motivo || '')} Se tiver dúvida, fale com a equipe Conectwork.</span></div>`
              : `<div class="banner info">${ic('clock')}<span><strong>Cadastro em análise</strong>A equipe Conectwork está conferindo os dados e os documentos. Quando terminar, as telas da empresa são liberadas.</span></div>`;
          el.innerHTML = `${banner}
            <div class="grid-2">
              <section class="card" id="mc-situacao"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Situação</h3><span style="margin-left:auto">${CW.sessao.pillStatus(st)}</span></div><div class="card-b">
                <dl class="dl" style="margin-bottom:18px"><div><dt>Protocolo</dt><dd id="mc-protocolo">${esc(e.protocolo || '—')}</dd></div><div><dt>Enviado em</dt><dd>${esc(formatarData(e.enviadoEm || e.criadoEm) || '—')}</dd></div></dl>
                <ul class="tl"><li class="done"><span class="dot">${ic('check')}</span>Cadastro enviado<small>${esc(formatarData(e.criadoEm) || '')}</small></li>
                  <li class="${x[0]}"><span class="dot"></span>${x[1]}<small>${x[2]}</small></li>
                  <li><span class="dot"></span>Aprovação e liberação dos módulos<small>pendente</small></li></ul>
                ${podeCorrigir ? `<button class="btn" id="mc-corrigir" style="margin-top:18px">${ic('edit')}Corrigir cadastro</button>` : ''}
              </div></section>
              <section class="card"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Empresa</h3></div><div class="card-b"><dl class="dl">
                <div class="full"><dt>Razão social</dt><dd>${esc(e.razao || '—')}</dd></div>
                <div><dt>Nome fantasia</dt><dd>${esc(e.nome || '—')}</dd></div><div><dt>CNPJ</dt><dd>${esc(e.cnpj || '—')}</dd></div>
                <div><dt>Uso</dt><dd>${esc(TIPOS[e.tipo] || '—')}</dd></div><div><dt>Cidade</dt><dd>${esc([e.cidade, e.uf].filter(Boolean).join('/') || '—')}</dd></div>
              </dl></div></section>
            </div>`;
          const b = document.getElementById('mc-corrigir'); if (b) b.onclick = () => corrigir(ctx).catch(err => U().toast(CW.fb.mensagemErro(err), 'erro'));
        }
      }
    }
  });
})();
