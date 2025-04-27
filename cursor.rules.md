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
