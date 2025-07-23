# Feature Development Workflow

1. **Setup Tools & Context**

   - `/new_task` — describe feature goal.
   - Ensure MCP tools (Context7, Serena) are active.
   - Load relevant files with `@folder` or `@file`.
   - Start Cline Agent:
     ```powershell
     cline agent start `
       --cluster context7-us `
       --browser chromium `
       --proxy-pool premium `
       --session sticky `
       --fingerprint-profile desktop-latest
     ```

2. **Plan Mode**

   - Switch to `/plan`.
   - Decompose feature into:
     ```
     Task 1: ...
       Sub-task 1.1: ...
     ```
   - Confirm plan is clear and complete.

3. **Execution (Act Mode)**

   - Switch to `/act`.
   - For each sub-task:
     - Implement change.
     - Run tests.
     - Commit with Conventional Commit:
       ```
       feat(<module>): add X feature
       ```
     - Mark sub-task done.

4. **Review & Merge**
   - Run full test suite.
   - Review diffs and finalize plan.
   - Commit cleanup:
     ```
     chore: remove unused code
     ```
