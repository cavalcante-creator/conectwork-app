/* Conectwork · leitura e conferência da nota fiscal de serviço (NFS-e) enviada pela prestadora.
   Não é módulo de menu: só deixa CW.nfse pronto para o espelho da nota.
   - XML: padrão nacional (Emissor Nacional, infNFSe com a chave de acesso de 50 números) e ABRASF (prefeituras).
   - PDF: o PDF da nota do Emissor Nacional (DANFSe) tem texto; o app lê o texto com o pdf.js e procura a chave, o número,
     a competência, os CNPJs e o valor. PDF escaneado (foto) não tem texto: vai para a conferência à mão.
   - Conferência: CNPJ de quem emitiu = prestadora do contrato; CNPJ do tomador = o do espelho; valor = valor do espelho;
     competência = a do espelho. "chaveUnica" impede a mesma nota em dois espelhos. */
(function () {
  const CW = window.CW = window.CW || {};
  const dig = v => String(v || '').replace(/\D/g, '');
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const centavos = v => { const s = String(v || '').trim(); if (!s) return null; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? Math.round(n * 100) : null; };
  const fmtCnpj = c => dig(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const brl = c => CW.ui ? CW.ui.formatarDinheiro(c) : 'R$ ' + (c / 100).toFixed(2);
  const compTxt = c => c ? c.slice(5, 7) + '/' + c.slice(0, 4) : '';

  /* ---------- XML ---------- */
  function lerXml(txt) {
    let x;
    try { x = new DOMParser().parseFromString(String(txt || ''), 'application/xml'); } catch (e) { return null; }
    if (!x || x.getElementsByTagName('parsererror').length) return null;
    const todos = n => Array.from(x.getElementsByTagNameNS('*', n));
    const um = (n, dentro) => { const b = dentro ? Array.from(dentro.getElementsByTagNameNS('*', n)) : todos(n); return b[0] ? String(b[0].textContent || '').trim() : ''; };
    const bloco = ns => { for (const n of ns) { const e = todos(n)[0]; if (e) return e; } return null; };
    const cnpjEm = e => e ? dig(um('CNPJ', e) || um('Cnpj', e) || um('CPF', e) || um('Cpf', e)) : '';
    const prest = bloco(['emit', 'prest', 'PrestadorServico', 'Prestador', 'IdentificacaoPrestador']);
    const toma = bloco(['toma', 'TomadorServico', 'Tomador', 'IdentificacaoTomador']);
    const inf = bloco(['infNFSe']);
    const chave = dig((inf && inf.getAttribute('Id')) || um('chNFSe') || '');
    const comp = (um('dCompet') || um('Competencia')).slice(0, 7);
    const r = { tipo: 'xml', chave: chave.length === 50 ? chave : '', numero: dig(um('nNFSe') || um('Numero')).replace(/^0+(?=\d)/, ''),
      emitenteCnpj: cnpjEm(prest), tomadorCnpj: cnpjEm(toma), valorCentavos: centavos(um('vServ') || um('ValorServicos')),
      liquidoCentavos: centavos(um('vLiq') || um('ValorLiquidoNfse')), competencia: /^\d{4}-\d{2}$/.test(comp) ? comp : '',
      emissao: (um('dhEmi') || um('DataEmissao') || um('dhProc')).slice(0, 10), descricao: (um('xDescServ') || um('Discriminacao')).slice(0, 500), lido: true };
    return (r.numero || r.chave || r.emitenteCnpj) ? r : null;
  }

  /* ---------- PDF (texto com o pdf.js, carregado só quando precisa) ---------- */
  let carregando = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!carregando) carregando = new Promise((ok, erro) => {
      const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); } catch (e) { erro(e); } };
      s.onerror = () => { carregando = null; erro(new Error('Não foi possível carregar o leitor de PDF. Confira a internet e tente de novo.')); };
      document.head.appendChild(s);
    });
    return carregando;
  }
  async function textoPdf(buf) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const partes = [];
    for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
      const pg = await doc.getPage(i), tc = await pg.getTextContent();
      partes.push(tc.items.map(it => it.str).join(' '));
    }
    return partes.join('\n');
  }
  /* lê o que der do texto do PDF; quem confere é conferir(), que procura os dados do espelho no texto */
  function lerTextoPdf(txt) {
    const t = String(txt || '').replace(/ /g, ' ');
    if (t.replace(/\s/g, '').length < 40) return null;   /* PDF escaneado: sem texto */
    const ch = (t.match(/(?<!\d)\d{50}(?!\d)/) || [])[0] || ((t.replace(/(\d)\s+(?=\d)/g, '$1').match(/(?<!\d)\d{50}(?!\d)/) || [])[0]) || '';
    const num = (t.match(/N[úu]mero\s+da\s+NFS-?e\s*:?\s*(\d+)/i) || t.match(/NFS-?e\s*(?:n[ºo°.]*|N[úu]mero)\s*:?\s*(\d+)/i) || [])[1] || '';
    const comp = t.match(/Compet[êe]ncia[^0-9]{0,40}(?:\d{2}\/)?(\d{2})\/(\d{4})/i);
    const cnpjs = Array.from(new Set((t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []).map(dig)));
    return { tipo: 'pdf', chave: ch, numero: num.replace(/^0+(?=\d)/, ''), competencia: comp ? comp[2] + '-' + comp[1] : '', cnpjs, texto: t, lido: true };
  }

  /* ---------- conferência com o espelho ---------- */
  /* esp: o espelho; r: o que foi lido (lerXml ou lerTextoPdf) ou null. Devolve { ok, manual, itens:[{k,ok,txt}], chaveUnica } */
  function conferir(esp, r) {
    const prest = dig(esp.prestadorCnpj), toma = dig((esp.tomador || {}).cnpj), itens = [];
    const it = (k, ok, txt) => itens.push({ k, ok: !!ok, txt });
    if (!r) return { ok: false, manual: true, itens: [{ k: 'leitura', ok: false, txt: 'Não deu para ler os dados do arquivo (PDF escaneado ou foto). A empresa que contrata confere à mão.' }], chaveUnica: '' };
    if (r.tipo === 'xml') {
      it('emitente', r.emitenteCnpj && r.emitenteCnpj === prest, r.emitenteCnpj === prest ? `Emitida pela prestadora do contrato (${fmtCnpj(prest)})` : `Emitida por outro CNPJ (${fmtCnpj(r.emitenteCnpj) || 'sem CNPJ'}); o do contrato é ${fmtCnpj(prest)}`);
      it('tomador', r.tomadorCnpj === toma, r.tomadorCnpj === toma ? `Tomador certo (${fmtCnpj(toma)})` : `Tomador errado (${fmtCnpj(r.tomadorCnpj) || 'sem CNPJ'}); o certo é ${fmtCnpj(toma)}`);
      it('valor', r.valorCentavos === esp.valorCentavos, r.valorCentavos === esp.valorCentavos ? `Valor ${brl(esp.valorCentavos)}` : `Valor da nota ${r.valorCentavos == null ? 'não encontrado' : brl(r.valorCentavos)}; o do espelho é ${brl(esp.valorCentavos)}`);
      if (r.competencia) it('competencia', r.competencia === esp.competencia, r.competencia === esp.competencia ? `Competência ${compTxt(esp.competencia)}` : `Competência ${compTxt(r.competencia)}; a do espelho é ${compTxt(esp.competencia)}`);
    } else {
      const t = r.texto, valorTxt = CW.ui ? CW.ui.formatarDinheiro(esp.valorCentavos, false) : '';
      it('emitente', r.cnpjs.includes(prest), r.cnpjs.includes(prest) ? `CNPJ da prestadora do contrato no PDF (${fmtCnpj(prest)})` : `O CNPJ da prestadora do contrato (${fmtCnpj(prest)}) não aparece no PDF`);
      it('tomador', r.cnpjs.includes(toma), r.cnpjs.includes(toma) ? `CNPJ do tomador no PDF (${fmtCnpj(toma)})` : `O CNPJ do tomador (${fmtCnpj(toma)}) não aparece no PDF`);
      it('valor', valorTxt && t.includes(valorTxt), t.includes(valorTxt) ? `Valor ${brl(esp.valorCentavos)} no PDF` : `O valor do espelho (${brl(esp.valorCentavos)}) não aparece no PDF`);
      if (r.competencia) it('competencia', r.competencia === esp.competencia, r.competencia === esp.competencia ? `Competência ${compTxt(esp.competencia)}` : `Competência ${compTxt(r.competencia)}; a do espelho é ${compTxt(esp.competencia)}`);
      if (!r.chave && !r.numero) it('numero', false, 'Não achamos a chave de acesso nem o número da nota no PDF');
    }
    const chaveUnica = r.chave ? r.chave : (r.numero && prest ? prest + '_' + r.numero : '');
    const ok = itens.every(x => x.ok) && !!chaveUnica;
    return { ok, manual: false, itens, chaveUnica };
  }

  CW.nfse = { lerXml, lerTextoPdf, textoPdf, conferir, fmtCnpj, dig };
})();
