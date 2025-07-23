# Bug Fix Workflow

1. **Initialize**

   - `/new_task` — describe bug and how to reproduce.
   - Ensure MCP servers loaded.
   - Load affected code/tests.

2. **Plan**

   - Use `/plan` to:
     ```
     Task 1: reproduce bug
     Task 2: fix root cause
     Task 3: add regression test
     ```

3. **Act**

   - Switch to `/act`.
   - For each task:
     - Reproduce bug in browser or logs.
     - Implement fix.
     - Add test.
     - Commit:
       ```
       fix(<module>): correct Y behavior
       ```
     - Mark done.

4. **Finalize**
   - Run complete tests.
   - Commit test cleanup:
     ```
     chore: clean up test artifacts
     ```
   - Push PR with clear description of fix steps and verification.
