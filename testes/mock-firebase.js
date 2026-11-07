/* Firebase "compat" simulado, só para os testes de tela (sem internet), no mesmo jeito do painel de referência.
   Servidor = localStorage '__srv' ({ users: {email: {uid, pass, disabled}}, docs: {caminho: dados} }).
   Controles em localStorage '__ctl': { offline, tooMany, enumProt (padrão true), negar: [prefixos de caminho], latenciaMs }.
   Registro do que aconteceu em window.__mockLog (ex.: ['signIn', email], ['reset', email, opcoes], ['grava', caminho]). */
(function () {
  const L = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  const ctl = () => L.get('__ctl', {});
  const srv = () => L.get('__srv', { docs: {}, users: {} });
  const salva = s => L.set('__srv', s);
  const espera = () => new Promise(r => setTimeout(r, ctl().latenciaMs || 5));
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const err = code => { const e = new Error(code); e.code = code; return e; };
  const negado = p => (ctl().negar || []).some(x => p.startsWith(x));
  window.__mockLog = [];

  const SERVER_TS = { __srvts: true };
  const resolve = v => { if (v && v.__srvts) return new Date().toISOString(); if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolve(v[k]); return o; } return v; };

  /* ---------- Firestore ---------- */
  const ouvintes = new Set(); const notifica = () => setTimeout(() => ouvintes.forEach(f => f()), 0);
  function Snap(path, d) { return { id: path.split('/').pop(), exists: d !== undefined, data: () => clone(d), ref: Ref(path) }; }
  async function ler(path) { await espera(); const c = ctl(); if (c.offline) throw err('unavailable'); if (negado(path)) throw err('permission-denied'); window.__mockLog.push(['le', path]); return Snap(path, clone(srv().docs[path])); }
  async function gravar(path, f) { await espera(); if (ctl().offline) throw err('unavailable'); if (negado(path)) throw err('permission-denied');
    const s = srv(); const n = f(s.docs[path]); if (n === undefined) delete s.docs[path]; else s.docs[path] = resolve(n); salva(s); window.__mockLog.push(['grava', path]); notifica(); }
  function Ref(path) {
    return { id: path.split('/').pop(), path,
      get: () => ler(path),
      set: (d, o) => gravar(path, a => (o && o.merge) ? Object.assign({}, a, d) : clone(d)),
      update: d => gravar(path, a => { if (a === undefined) throw err('not-found'); return Object.assign({}, a, d); }),
      delete: () => gravar(path, () => undefined),
      onSnapshot: (ok, er) => { let vivo = true; const f = () => vivo && ler(path).then(ok, er); ouvintes.add(f); f(); return () => { vivo = false; ouvintes.delete(f); }; } };
  }
  function Query(col, filtros, lim) {
    async function exec() { await espera(); const c = ctl(); if (c.offline) throw err('unavailable'); if (negado(col)) throw err('permission-denied');
      window.__mockLog.push(['consulta', col, filtros]);
      const base = srv().docs, n = col.split('/').length + 1;
      let ds = Object.keys(base).filter(p => p.startsWith(col + '/') && p.split('/').length === n).sort().map(p => ({ p, d: base[p] }));
      filtros.forEach(([k, op, v]) => { ds = ds.filter(x => { const a = x.d[k]; return op === '==' ? a === v : op === 'in' ? v.includes(a) : op === 'array-contains' ? Array.isArray(a) && a.includes(v) : true; }); });
      if (lim) ds = ds.slice(0, lim);
      const docs = ds.map(x => Snap(x.p, clone(x.d)));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) }; }
    return { where: (k, op, v) => Query(col, filtros.concat([[k, op, v]]), lim), orderBy: () => Query(col, filtros, lim), limit: n => Query(col, filtros, n),
      get: exec,
      onSnapshot: (ok, er) => { let vivo = true; const f = () => vivo && exec().then(ok, er); ouvintes.add(f); f(); return () => { vivo = false; ouvintes.delete(f); }; },
      add: async d => { const id = 'id' + Math.random().toString(36).slice(2, 10); await gravar(col + '/' + id, () => clone(d)); return Ref(col + '/' + id); },
      doc: id => Ref(col + '/' + (id || 'id' + Math.random().toString(36).slice(2, 10))) };
  }
  const FS = { useEmulator: (h, p) => window.__mockLog.push(['fsEmulador', h, p]), settings() {},
    doc: p => Ref(p), collection: p => Query(p, [], 0),
    batch: () => { const pend = []; const b = { set: (r, d) => { pend.push([r.path, () => clone(d)]); return b; }, update: (r, d) => { pend.push([r.path, a => Object.assign({}, a, d)]); return b; }, commit: async () => { for (const [p, f] of pend) await gravar(p, f); } }; return b; } };

  /* ---------- Auth ---------- */
  const KEY = '__sess';
  const cbs = [];
  let atual = L.get(KEY, null);
  const User = r => r ? { uid: r.uid, email: r.email } : null;
  const muda = r => { atual = r; if (r) L.set(KEY, r); else localStorage.removeItem(KEY); cbs.forEach(cb => setTimeout(() => cb(User(r)), 0)); };
  const auth = {
    languageCode: null,
    get currentUser() { return User(atual); },
    useEmulator: u => window.__mockLog.push(['authEmulador', u]),
    onAuthStateChanged: cb => { cbs.push(cb); window.__mockLog.push(['onAuthStateChanged']); setTimeout(() => cb(User(atual)), ctl().authMs || 20); return () => {}; },
    setPersistence: async t => { window.__mockLog.push(['persist', t]); },
    signInWithEmailAndPassword: async (em, p) => { await espera(); const c = ctl(); window.__mockLog.push(['signIn', em]);
      if (c.offline) throw err('auth/network-request-failed');
      if (c.tooMany) throw err('auth/too-many-requests');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw err('auth/invalid-email');
      const u = srv().users[em];
      if (!u) throw err(c.enumProt === false ? 'auth/user-not-found' : 'auth/invalid-credential');
      if (u.disabled) throw err('auth/user-disabled');
      if (u.pass !== p) throw err(c.enumProt === false ? 'auth/wrong-password' : 'auth/invalid-credential');
      muda({ uid: u.uid, email: em }); return { user: User(atual) }; },
    sendPasswordResetEmail: async (em, op) => { await espera(); const c = ctl(); window.__mockLog.push(['reset', em, op || null, auth.languageCode]);
      if (c.offline) throw err('auth/network-request-failed');
      if (c.tooMany) throw err('auth/too-many-requests');
      if (!srv().users[em] && c.enumProt === false) throw err('auth/user-not-found'); },
    signOut: async () => { window.__mockLog.push(['signOut']); muda(null); }
  };

  const apps = [];
  const firebase = window.firebase = {
    apps, initializeApp: cfg => { const a = { name: '[DEFAULT]', options: cfg, auth: () => auth, firestore: () => FS }; apps.push(a); window.__mockLog.push(['init', cfg && cfg.projectId]); return a; },
    auth: () => auth, firestore: () => FS
  };
  firebase.firestore.FieldValue = { serverTimestamp: () => SERVER_TS };
})();
