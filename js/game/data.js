/* ============================================================================
 * GAME WORLD LAYER · static world data (regions, deployable world objects, ranks)
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const G = (AM.G = AM.G || {});

  /** The Central Hub is a place, not a challenge region, so it is listed separately. */
  G.HUB = { id: 'hub', name: 'Central Hub', concept: 'Navigation · Progression · Archive', color: '#a78bfa' };

  /** Regions. `max` = example world scores from the blueprint (section 7.4); tests assert challenge maxima add up to them. */
  G.WORLDS = [
    { id: 'regular', name: 'Regular City', short: 'Regular City', concept: 'DFA · Regular Languages', model: 'FA', max: 3500, color: '#22d3ee', color2: '#0e7490', icon: 'city', unlock: null,
      tagline: 'Deterministic computation. Every gate, validator and vending machine is a DFA.',
      lesson: 'A DFA has finitely many states and exactly one move per symbol — its only memory is which state it is in.' },
    { id: 'nfa', name: 'Nondeterministic District', short: 'NFA District', concept: 'NFA · ε-NFA · Subset construction', model: 'FA', max: 2900, color: '#c084fc', color2: '#7e22ce', icon: 'clones', unlock: { world: 'regular', count: 2 },
      tagline: 'Choices split you into clones. ε-portals teleport without reading input.',
      lesson: 'An NFA accepts if ANY branch accepts. Subset construction merges all live clones into one super-state — that is how an NFA becomes a DFA.' },
    { id: 'cfg', name: 'Grammar Forest', short: 'Grammar Forest', concept: 'Context-Free Grammars', model: 'CFG', max: 2700, color: '#4ade80', color2: '#15803d', icon: 'forest', unlock: { world: 'nfa', count: 2 },
      tagline: 'Production rules are seeds. Apply them and a derivation tree grows.',
      lesson: 'A CFG generates strings by rewriting nonterminals. Parse trees show HOW a string was derived — and ambiguity means more than one way.' },
    { id: 'pda', name: 'Stack Factory', short: 'Stack Factory', concept: 'Pushdown Automata', model: 'PDA', max: 2400, color: '#fbbf24', color2: '#b45309', icon: 'factory', unlock: { world: 'cfg', count: 2 },
      tagline: 'Memory you can see: a vertical stack that a DFA never had.',
      lesson: 'A PDA = NFA + a stack. The stack gives unbounded (but last-in-first-out) memory — enough for aⁿbⁿ and nested structure.' },
    { id: 'tm', name: 'Turing Lab', short: 'Turing Lab', concept: 'Turing Machines', model: 'TM', max: 1800, color: '#60a5fa', color2: '#1d4ed8', icon: 'tape', unlock: { world: 'pda', count: 2 },
      tagline: 'An infinite tape, a moving head, read → write → move.',
      lesson: 'A Turing machine reads, writes and moves on an unbounded tape. It is the most general model of computation we know.' },
    { id: 'void', name: 'Void Zone', short: 'Void Zone', concept: 'Undecidability · Halting Problem', model: 'VOID', max: 1000, color: '#fb7185', color2: '#9f1239', icon: 'void', unlock: { world: 'tm', count: 2 },
      tagline: 'Where observation ends. Some questions have no algorithm.',
      lesson: 'Running a machine for longer never PROVES it will not halt. The Halting Problem is undecidable.' },
  ];
  G.worldById = (id) => G.WORLDS.find((w) => w.id === id) || (id === 'hub' ? G.HUB : null);

  /** Objects in the world that a verified machine can be deployed into. */
  G.OBJECTS = [
    { id: 'gate_main', world: 'regular', name: 'Main Security Gate', icon: 'gate', kind: 'acceptor', accepts: ['DFA', 'NFA', 'ENFA'], alphabet: ['0', '1'], policy: { 1: 'R1', 2: 'C1' },
      blurb: 'Visitors present a binary pass-code. The gate opens only if the deployed machine ACCEPTS it.', admit: 'GATE OPENS', deny: 'GATE LOCKED' },
    { id: 'vending', world: 'regular', name: 'Vending Controller', icon: 'vending', kind: 'acceptor', accepts: ['DFA', 'NFA', 'ENFA'], alphabet: ['a', 'b'], policy: { 1: 'R2', 2: 'C2' },
      blurb: 'Button presses (a / b) arrive as strings. The machine decides whether the sequence is dispensed or jams.', admit: 'DISPENSE', deny: 'JAMMED' },
    { id: 'scanner', world: 'nfa', name: 'Maze Exit Scanner', icon: 'scanner', kind: 'acceptor', accepts: ['DFA', 'NFA', 'ENFA'], alphabet: ['a', 'b'], policy: { 1: 'N1' },
      blurb: 'Clones fan out through the maze; the exit scanner releases the paths the deployed machine accepts.', admit: 'EXIT OPEN', deny: 'SEALED' },
    { id: 'seeder', world: 'cfg', name: 'Seed Dispenser', icon: 'seeder', kind: 'acceptor', accepts: ['CFG'], alphabet: ['a', 'b'], policy: { 1: 'G1' },
      blurb: 'Only seeds the deployed grammar can derive are planted.', admit: 'PLANTED', deny: 'WITHERED' },
    { id: 'crate', world: 'pda', name: 'Crate Stacker Line', icon: 'crate', kind: 'acceptor', accepts: ['PDA'], alphabet: ['a', 'b'], policy: { 1: 'P1' },
      blurb: 'Crates (a) are stacked, then unstacked (b). A load the deployed PDA accepts passes the line.', admit: 'LOAD OK', deny: 'JAM' },
    { id: 'tape', world: 'tm', name: 'Tape Processor', icon: 'processor', kind: 'transformer', accepts: ['TM'], alphabet: ['0', '1'], policy: { 1: 'T2' },
      blurb: 'Each tape is rewritten by the deployed Turing machine — whatever function it computes.', admit: 'TAPE WRITTEN', deny: 'FAULT' },
  ];
  G.objectById = (id) => G.OBJECTS.find((o) => o.id === id);

  G.RANKS = ['Initiate', 'Symbol Runner', 'State Builder', 'Language Architect', 'Machine Smith', 'Grandmaster of Computation', 'Turing Laureate', 'Oracle of the Metaverse'];

  /** Machine-type display names */
  G.TYPE_LABEL = { DFA: 'DFA', NFA: 'NFA', ENFA: 'ε-NFA', CFG: 'CFG', PDA: 'PDA', TM: 'Turing Machine' };
  G.TYPE_COLOR = { DFA: '#22d3ee', NFA: '#c084fc', ENFA: '#e879f9', CFG: '#4ade80', PDA: '#fbbf24', TM: '#60a5fa' };
})();
