/* ============================================================================
 * GAME WORLD LAYER · persistent state (Player, World, Machine, Attempt,
 * Achievement, Deployment — blueprint §15) saved in localStorage, with an
 * in-memory fallback so the game also works when storage is blocked.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const G = (AM.G = AM.G || {});
  const KEY = 'automata-metaverse/save/v1';

  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
  function pickStorage() {
    try {
      if (typeof localStorage !== 'undefined') { localStorage.setItem('__am_probe', '1'); localStorage.removeItem('__am_probe'); return localStorage; }
    } catch (e) { /* blocked → fall back */ }
    return memoryStorage();
  }

  const Store = (G.Store = {
    storage: pickStorage(),
    state: null,
    listeners: [],
    _timer: null,
    persistent: true,
  });

  Store.newState = function (name) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      player: { name: name || 'Operator', xp: 0 },
      settings: { sound: true, reduceMotion: false, highContrast: false, demo: false, fontScale: 1, randomize: true },
      progress: {},        // challengeId → { completed, best, bestParts, attempts, fails, noHintSolved, … }
      visited: {},         // worldId → true
      machines: [],        // Machine Archive
      attempts: [],        // Attempt history (analytics)
      achievements: {},    // id → { at }
      objects: {},         // objectId → { deployed:{machineId,at}|null, policyVersion, log:[] }
      contracts: {},       // contractId → { accepted, at }
      stats: { gardenStrings: [], probes: 0, tests: 0, distinguished: 0, ambiguousFound: 0, minimalDFA: false, branchMaster: false, deployedMachineIds: [], memoryCheck: false },
      drafts: {},          // challengeId → unfinished machine
      void: {},            // Void Zone working data
      variantHistory: {},  // slot → the last challenge variants rolled (so a new visit never repeats the last one)
    };
  };

  /** merge a loaded save into a fresh state so old saves keep working when fields are added */
  function hydrate(raw) {
    const base = Store.newState();
    const s = Object.assign(base, raw);
    s.player = Object.assign(base.player, raw.player || {});
    s.settings = Object.assign(base.settings, raw.settings || {});
    s.stats = Object.assign(base.stats, raw.stats || {});
    return s;
  }

  Store.load = function () {
    try {
      const txt = Store.storage.getItem(KEY);
      Store.state = txt ? hydrate(JSON.parse(txt)) : Store.newState();
    } catch (e) {
      Store.state = Store.newState();
    }
    return Store.state;
  };
  Store.hasSave = () => { try { return !!Store.storage.getItem(KEY); } catch (e) { return false; } };
  Store.flush = function () {
    clearTimeout(Store._timer);
    try { Store.storage.setItem(KEY, JSON.stringify(Store.state)); Store.persistent = true; } catch (e) { Store.persistent = false; }
  };
  Store.save = function () {
    clearTimeout(Store._timer);
    Store._timer = setTimeout(Store.flush, 120);
    Store.emit();
  };
  Store.on = (fn) => { Store.listeners.push(fn); return () => (Store.listeners = Store.listeners.filter((f) => f !== fn)); };
  Store.emit = () => { for (const f of Store.listeners) { try { f(Store.state); } catch (e) { console.error(e); } } };
  Store.reset = function (name) { Store.state = Store.newState(name); Store.flush(); Store.emit(); };
  Store.exportJSON = () => JSON.stringify(Store.state, null, 2);
  Store.importJSON = function (text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || !raw.player || !Array.isArray(raw.machines)) throw new Error('This is not an Automata Metaverse save file.');
    Store.state = hydrate(raw); Store.flush(); Store.emit();
  };

  /* ---------- machine archive ---------- */
  let _mid = 0;
  const mkId = () => 'm' + Date.now().toString(36) + (++_mid).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

  Store.addMachine = function (rec) {
    const m = Object.assign({ id: mkId(), name: 'Untitled machine', type: 'DFA', structure: null, verified: false, score: 0, created: new Date().toISOString(), updated: new Date().toISOString(), challengeId: null, history: [], deployments: [] }, rec);
    Store.state.machines.push(m);
    Store.save();
    return m;
  };
  Store.getMachine = (id) => Store.state.machines.find((m) => m.id === id) || null;
  Store.updateMachine = function (id, patch) {
    const m = Store.getMachine(id);
    if (!m) return null;
    Object.assign(m, patch, { updated: new Date().toISOString() });
    Store.save();
    return m;
  };
  Store.renameMachine = (id, name) => Store.updateMachine(id, { name: String(name).trim().slice(0, 48) || 'Untitled machine' });
  Store.deleteMachine = function (id) {
    const m = Store.getMachine(id);
    if (!m) return false;
    for (const o of Object.values(Store.state.objects)) if (o.deployed && o.deployed.machineId === id) o.deployed = null;
    Store.state.machines = Store.state.machines.filter((x) => x.id !== id);
    Store.save();
    return true;
  };

  /* ---------- object / deployment state ---------- */
  Store.objectState = function (id) {
    const o = Store.state.objects;
    if (!o[id]) o[id] = { deployed: null, policyVersion: 1, log: [] };
    return o[id];
  };
})();
