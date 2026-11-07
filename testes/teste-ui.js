/* Teste dos componentes de js/ui.js: validações, máscaras, dinheiro, datas, aviso rápido, diálogo e painel lateral. */
const H = require('./harness');
const { ok, fim } = H.placar('ui');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed();
  await H.preparar(page, d); await page.goto(H.BASE); await page.waitForSelector('#lg-email', { timeout: 8000 });
  const ev = (f, a) => page.evaluate(f, a);

  const v = await ev(() => { const u = CW.ui; return {
    cnpj: ['11.222.333/0001-81', '11222333000181', '45.723.174/0001-10'].map(u.validarCNPJ),
    cnpjRuim: ['11.222.333/0001-82', '11.111.111/1111-11', '1122233300018', ''].map(u.validarCNPJ),
    cpf: ['529.982.247-25', '52998224725', '111.444.777-35'].map(u.validarCPF),
    cpfRuim: ['529.982.247-24', '111.111.111-11', '5299822472', null].map(u.validarCPF),
    email: ['ana@alfa.com.br', 'a.b+c@x.io'].map(u.validarEmail),
    emailRuim: ['ana@', 'ana@alfa', 'ana alfa@x.com', 'ana@@x.com', 'a..b@x.com', ''].map(u.validarEmail),
    cel: ['(51) 99999-1234', '11987654321'].map(u.validarCelular),
    celRuim: ['(51) 3333-1234', '(20) 99999-1234', '99999-1234', '(51) 89999-1234'].map(u.validarCelular),
    data: ['29/02/2024', '31/12/2026', '2026-11-06'].map(u.validarData),
    dataRuim: ['29/02/2025', '31/04/2026', '32/01/2026', '2026-13-01', '1/1/2026', ''].map(u.validarData),
    iso: u.dataISO('06/11/2026')
  }; });
  const todos = (a, x) => a.every(y => y === x);
  ok('U1 CNPJ: valida pelo dígito verificador (com e sem máscara) e recusa repetidos e errados', todos(v.cnpj, true) && todos(v.cnpjRuim, false), JSON.stringify([v.cnpj, v.cnpjRuim]));
  ok('U2 CPF: valida pelo dígito verificador e recusa repetidos e errados', todos(v.cpf, true) && todos(v.cpfRuim, false), JSON.stringify([v.cpf, v.cpfRuim]));
  ok('U3 e-mail', todos(v.email, true) && todos(v.emailRuim, false), JSON.stringify([v.email, v.emailRuim]));
  ok('U4 celular com DDD (11 dígitos, DDD que existe, começa com 9)', todos(v.cel, true) && todos(v.celRuim, false), JSON.stringify([v.cel, v.celRuim]));
  ok('U5 datas: confere se o dia existe (29/02 só em ano bissexto, 31/04 não)', todos(v.data, true) && todos(v.dataRuim, false) && v.iso === '2026-11-06', JSON.stringify([v.data, v.dataRuim, v.iso]));

  const m = await ev(() => { const u = CW.ui, k = u.mascara; return {
    cnpj: k.cnpj('11222333000181'), cpf: k.cpf('52998224725'), cep: k.cep('90010000'), cel: k.celular('51999991234'), fixo: k.celular('5133331234'), data: k.data('06112026'), din: k.dinheiro('123456'), din0: k.dinheiro('5'),
    fmt: [u.formatarDinheiro(123456), u.formatarDinheiro(5), u.formatarDinheiro(-100050), u.formatarDinheiro(100000000)],
    ler: [u.lerDinheiro('R$ 1.234,56'), u.lerDinheiro('1234,5'), u.lerDinheiro('10'), u.lerDinheiro('0,07'), u.lerDinheiro('abc'), u.lerDinheiro('1,234')],
    fdata: [u.formatarData('2026-11-06'), u.formatarData(new Date(2026, 0, 5, 9, 7)), u.formatarDataHora(new Date(2026, 0, 5, 9, 7)), u.formatarData({ toDate: () => new Date(2026, 1, 3) }), u.formatarData(null)] }; });
  ok('U6 máscaras de CNPJ, CPF, CEP, celular, data e dinheiro', m.cnpj === '11.222.333/0001-81' && m.cpf === '529.982.247-25' && m.cep === '90010-000' && m.cel === '(51) 99999-1234' && m.fixo === '(51) 3333-1234' && m.data === '06/11/2026' && m.din === '1.234,56' && m.din0 === '0,05', JSON.stringify(m));
  ok('U7 dinheiro em centavos: formata em R$ e lê de volta (texto inválido → null)', JSON.stringify(m.fmt) === JSON.stringify(['R$ 1.234,56', 'R$ 0,05', '-R$ 1.000,50', 'R$ 1.000.000,00']) && JSON.stringify(m.ler) === JSON.stringify([123456, 123450, 1000, 7, null, null]), JSON.stringify([m.fmt, m.ler]));
  ok('U8 datas formatadas (texto ISO, Date e Timestamp do Firestore)', JSON.stringify(m.fdata) === JSON.stringify(['06/11/2026', '05/01/2026', '05/01/2026 09:07', '03/02/2026', '']), JSON.stringify(m.fdata));

  // U9 máscara ligada no campo enquanto digita
  await ev(() => { const f = document.createElement('div'); f.id = 'form-teste'; f.innerHTML = '<input id="i-cnpj" data-mascara="cnpj"><input id="i-din" data-mascara="dinheiro">'; document.body.appendChild(f); CW.ui.aplicarMascaras(f); });
  await page.type('#i-cnpj', '11222333000181'); await page.type('#i-din', '98765');
  const u9 = await ev(() => [document.getElementById('i-cnpj').value, document.getElementById('i-din').value, document.getElementById('i-cnpj').inputMode]);
  ok('U9 máscara aplicada enquanto a pessoa digita (e teclado numérico no celular)', u9[0] === '11.222.333/0001-81' && u9[1] === '987,65' && u9[2] === 'numeric', JSON.stringify(u9));

  // U10 aviso rápido
  await ev(() => CW.ui.toast('Convite enviado <b>x</b>.')); await H.dorme(100);
  const u10 = await ev(() => ({ show: document.getElementById('toast').classList.contains('show'), t: document.getElementById('toast').innerText, html: document.getElementById('toast').innerHTML.includes('<b>') }));
  ok('U10 aviso rápido aparece e não interpreta HTML do texto', u10.show && u10.t === 'Convite enviado <b>x</b>.' && !u10.html, JSON.stringify(u10));

  // U11 diálogo
  const p = ev(() => CW.ui.confirmar('Bloquear acesso', 'A pessoa deixa de entrar na empresa.', 'Bloquear'));
  await page.waitForSelector('dialog[open]');
  const u11 = await ev(() => ({ t: document.querySelector('dialog[open] h2').innerText, b: Array.from(document.querySelectorAll('dialog[open] .dlg-f button')).map(x => x.innerText) }));
  await page.click('dialog[open] [data-dlg-b="1"]'); const r1 = await p;
  const p2 = ev(() => CW.ui.confirmar('X', 'Y')); await page.waitForSelector('dialog[open]'); await page.keyboard.press('Escape'); const r2 = await p2;
  ok('U11 diálogo de confirmação: botões, resposta "sim" e Esc cancela', u11.t === 'Bloquear acesso' && u11.b.join('|') === 'Voltar|Bloquear' && r1 === true && r2 === false && !(await ev(() => !!document.querySelector('dialog'))), JSON.stringify([u11, r1, r2]));

  // U12 painel lateral
  const p3 = ev(() => CW.ui.painelLateral({ titulo: 'Detalhe', corpo: '<p id="pl-corpo">Corpo</p>', botoes: [{ texto: 'Fechar', valor: 'f', classe: 'sec' }] }));
  await page.waitForSelector('dialog.drawer[open] #pl-corpo'); await H.dorme(400); /* espera a animação de entrada */
  const u12 = await ev(() => { const r = document.querySelector('dialog.drawer[open]').getBoundingClientRect(); return { dir: Math.round(r.right), larg: innerWidth, alto: Math.round(r.height), h: innerHeight }; });
  await page.click('dialog.drawer [data-dlg-b="0"]'); const r3 = await p3;
  ok('U12 painel lateral abre colado à direita, na altura da tela, e devolve o botão', u12.dir === u12.larg && u12.alto === u12.h && r3 === 'f', JSON.stringify([u12, r3]));

  // U13 tema claro/escuro
  const u13 = await ev(() => { const a = CW.ui.trocarTema(), b = CW.ui.trocarTema(), bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), c = CW.ui.trocarTema(); return [a, b, bg, c, localStorage.getItem('cw.tema')]; });
  ok('U13 tema: automático → claro → escuro → automático (e o fundo muda)', u13[0] === 'light' && u13[1] === 'dark' && u13[2].toUpperCase() === '#050D24' && u13[3] === 'auto' && u13[4] === null, JSON.stringify(u13));

  const code = fim(erros); await browser.close(); process.exit(code);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
