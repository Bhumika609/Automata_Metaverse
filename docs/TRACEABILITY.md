# Traceability: blueprint requirement → implementation

| Blueprint area | Where it lives |
|---|---|
| Central Hub (navigation, progression, archive access) | `js/ui/screens.js` hub map; `js/game/engine.js` unlocking |
| Regular City — DFA missions, probing, minimization, twin gates | `js/game/challenges.js` R1–R6; `js/formal/fa.js`; `js/ui/mission.js` (twin) |
| Nondeterministic District — clone splitting, ε-portals, subset construction | `fa.js` `simulate/toDFA`; `js/ui/editor.js` orb engine; `js/ui/tools.js` Subset Lab; N1–N4 |
| Grammar Forest — CFG, derivation trees, ambiguity, CNF | `js/formal/cfg.js`; `widgets.js` TreeView/GrammarDeck; `tools.js` Garden + CNF Lens; G1–G4 |
| Stack Factory — PDA, visible stack | `js/formal/pda.js`; `widgets.js` StackView; `tools.js` Memory Check; P1–P3 |
| Turing Lab — tape and head | `js/formal/tm.js`; `widgets.js` TapeView; T1–T3 |
| Void Zone — halting / undecidability | `tm.js` loop detection; `challenges.js` V1–V2; `mission.js` void screens |
| Machine Archive (save, verify, reuse, deploy, compare, combine) | `js/game/store.js`, `engine.js`; `screens.js` archive; `mission.js` deploy flow |
| Verification layer + counterexample / debug feedback | `challenges.js` `G.verify*`; `mission.js` debug overlay |
| Deployment objects & policy changes | `data.js` OBJECTS; `engine.js` deploy/contracts; `screens.js` object stages |
| Level / World / Overall score, XP, levels | `js/game/scoring.js`, `engine.js` |
| Achievements (9 specified + 5 extra) | `js/game/achievements.js`; `screens.js` |
| JFLAP / formal layer integration | `js/formal/jflap.js`; editor ⬇/⬆ .jff; Lab; Archive; `jflap-samples/` |
| JFLAP-style tools (regex↔FA, CFG→PDA, LL(1), Multiple Run) + real-JFLAP launcher | `js/formal/jflap_tools.js`, `js/ui/jflap_ui.js`, `serve.js` `/api/jflap/*`, `tests/jflap.test.js` |
| Level logic defined in JFLAP files | `jflap/levels/*.jff` → `tools/build-levels.js` → `js/game/jflap_levels.js` → `js/game/challenges.js` (`JFF()`); `tests/levels.test.js` |
| UI: HUD, mission panel, editor, simulation panel, archive, achievements, results, debug overlay, world map | `js/app.js`, `js/ui/*`, `css/style.css` |
| Data model (Player, World, Machine, Attempt, Achievement, Deployment) | `js/game/store.js` |
| Tests (§17) | `tests/formal.test.js` (56), `tests/game.test.js` (89); browser flow run on all 22 missions |
| Evaluator demo flow (§18) | `docs/DEMO_SCRIPT.md`; Demo mode toggle |


## Challenge variants (extension)
| Requirement | Implementation | Test |
|---|---|---|
| Different challenge each visit, same order | `js/game/variants.js` (pools, seeded roll, no repeat) , `js/app.js` boot | `tests/variants.test.js` › rolling |
| Variant logic lives in JFLAP | `jflap/levels/<Slot>_<variant>_*.jff`, `tools/seed-variants.js` | › every variant: oracle = independent predicate |
| Fair per-variant scoring/archive/deploy | `engine.js` (variantId on drafts, archive, deployments) | › deployment, drafts, policies |
