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
    - **NEVER** create new CSS files that aren't immediately imported and used
    - Any new component MUST be imported and used immediately or NOT created at all
    - Only use TypeScript (.tsx) OR JavaScript (.jsx) for a component, never both
    - Always verify the migration is complete by checking imports and removing the original code
    - Before deleting ANY file, check that it isn't referenced in imports or directly used by the app
    - If creating a new CSS file, make sure it's imported in the component or in the global index.css
14. Every PR should result in LESS code, not more duplicated code.
15. **MEMORY PERSISTENCE AND EFFICIENCY RULES**:
    - Maintain memory of files already examined in the current session
    - Never re-check if a file exists after its existence has been confirmed
    - Keep track of file contents that have been viewed and refer to stored information
    - Avoid redundant tool calls to check for the same information repeatedly
    - Before using tools to find information, check if that information has already been discovered
    - Maintain conversational context and user history to prevent repetitive work
    - Use information persistence to minimize response time and redundant operations

- Note: App.jsx is over 3000 lines. Always consider this when making changes or reviewing the file.

## React Performance Rules (Learned from Jan 2025 optimization)

**🚨 CRITICAL: Always check these patterns before making React changes**

16. **PREVENT EXCESSIVE RE-RENDERS:**
    - **Timers/Intervals**: Return same reference when no actual changes needed
    - **Context Providers**: Always memoize context value objects with `useMemo()`
    - **User Interactions**: Use direct DOM manipulation + debounced state updates, NOT state updates on every event
    - **useCallback Dependencies**: Use refs for condition checking to avoid unstable dependencies
    - **useEffect Chains**: Combine related effects to prevent cascading updates

17. **PERFORMANCE ANTI-PATTERNS TO AVOID:**
    - ❌ `setPhotos(prev => prev.map(...))` in timers without checking if changes are needed
    - ❌ Context value objects recreated on every render: `value={{ photos, setPhotos }}`
    - ❌ `onChange={e => setState(e.target.value)}` for sliders/drag interactions
    - ❌ useCallback with changing dependencies that cause effect re-runs
    - ❌ Cascading useEffect hooks that trigger each other

18. **PERFORMANCE PATTERNS TO USE:**
    - ✅ Check for actual changes before updating state: `if (!hasChanges) return previousState`
    - ✅ Memoize context values: `useMemo(() => ({ photos, setPhotos }), [photos])`
    - ✅ Direct DOM updates during interactions: `element.style.transform = ...`
    - ✅ Debounce state updates: `setTimeout(() => setState(value), 150)`
    - ✅ Use refs for stable condition checking: `conditionsRef.current = { state }`

**Remember: React performance is about preventing unnecessary work, not just optimizing necessary work.**
