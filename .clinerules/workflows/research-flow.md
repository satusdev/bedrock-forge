# Research & Prototype Workflow

1. **Initiation**

   - `/new_task` — research goal (e.g., find best lib for Z).
   - Activate research MCP tools (Perplexity, Hyperbrowser).

2. **Plan**

   - `/plan`:
     ```
     Task 1: search web for libs
       Sub-task: evaluate top 3
     Task 2: prototype small demo
     ```

3. **Act**

   - `/act`.
   - Research via MCP:
     - e.g. `search`, `scrape_webpage`, summarization.
   - Commit research summary:
     ```
     docs(research): summarize evaluation of libs
     ```
   - Prototype code, commit:
     ```
     feat(prototype): initial demo implementation
     ```

4. **Review**
   - Validate prototype.
   - If valid: finalize and send PR.
   - If not: update plan and re-run workflow.
