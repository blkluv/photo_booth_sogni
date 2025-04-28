## Cursor Project Rules – Sogni Photobooth

1. All React components live in `src/components/`.
2. Utility helpers live in `src/utils/` and must export pure functions.
3. Global styling is `App.css`; **never** rename existing classes.
4. Keep all audio / image imports (`*.mp3`, `*.png`) intact.
5. When splitting a component  
   – move only **one** unit per step,  
   – copy its propTypes / TS types,  
   – re-import `./App.css` in the new file.  
6. After every edit, run  
   ```bash
   pnpm lint && pnpm dev --once
   ```  
   and stop on any error.
7. Never rewrite or delete files unless explicitly asked.
8. Switch to **gpt-4o-xl** automatically when a single file > 800 lines.
9. **NEVER** duplicate large portions of code or create alternate versions of files. If a file needs refactoring:
   - Create smaller, modular components
   - Use proper React patterns like HOCs, render props, or hooks
   - Document WHY the code exists in comments
10. Always check if files are actually used in the codebase before modifying them.
11. When creating experimental features, use feature flags instead of duplicate files.
12. Maintain a single source of truth for all functionality.
13. **IMPORTANT - CODE MIGRATION RULES**:
    - **NEVER** create a component file without immediately importing and using it
    - **NEVER** leave code in the original file after migrating it to a component (complete the migration)
    - **NEVER** create both .tsx and .jsx versions of the same component
    - Any new component MUST be imported and used immediately or NOT created at all
    - Only use TypeScript (.tsx) OR JavaScript (.jsx) for a component, never both
    - Always verify the migration is complete by checking imports and removing the original code
14. Every PR should result in LESS code, not more duplicated code.
