# Evaluator demo flow (≈10 minutes)

1. **Title** → tick *Demo mode* → ENTER. Show the **Central Hub** map: six regions, level ring, scores.
2. **Regular City → R1 (Even-One Gate).** Use the oracle probe, ask for Hint 1 (reveals the formal rule), draw the 2-state DFA, step through a string with ▶ Run, press **Verify**. Show the results breakdown (500 correctness + bonuses) and the archived machine.
3. **Debug feedback:** in R2 submit a deliberately wrong machine → debug overlay shows the shortest counterexample → *Replay in simulator*.
4. **Deploy:** results → *Deploy to Main Security Gate* → compliance report → region page → **Run a shift**. Accept the **Gate Policy v2** contract: old machine now fails compliance; patch it.
5. **NFA District → N1:** run “aab” and watch clones split and die; **N4 Subset Lab** builds the DFA table row by row; Archive → Compare two machines (shortest counterexample).
6. **Grammar Forest → G1/G4:** Grow a derivation tree; Ambiguity Hunt shows two parse trees for `a+a+a`; CNF Lens.
7. **Stack Factory → P1:** Memory Check (why a DFA can't count), then run aⁿbⁿ and watch the stack.
8. **Turing Lab → T2:** binary incrementer on the tape.
9. **Void Zone → V1:** run machines to 1,000,000 steps; only observation-vs-proof is rewarded.
10. **Archive / Lab:** combine machines (product), export `.jff`, import `jflap-samples/anbn-pda.jff`. Finish on **Profile** (radar, analytics) and **Achievements**.


## Note on random challenges
Every visit rolls different challenge variants. For a fully scripted run open `index.html?classic` (original challenges) or `index.html?seed=demo1` (any fixed, repeatable set). Show the 🎲 *Different challenge* button on a mission and Profile → *This visit's challenges*.
