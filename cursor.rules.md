# Cursor Rules for Sogni Photobooth

## CSS Specificity Rules
- **NEVER write redundant CSS selectors** - Use ONE selector with proper specificity, not multiple variations
- **Calculate CSS specificity properly**: IDs (100) > Classes (10) > Elements (1) > Universal (0)
- **Use the minimum specificity needed** to override existing rules
- **Avoid "nuclear option" selectors** with excessive redundancy like `html body div * .class, html body #root * .class`
- **One selector per rule** - if you need high specificity, use `html body #root .specific-class` (specificity: 112)

## useEffect Critical Rules 🚨
- **NEVER put functions in useEffect dependency arrays** - causes infinite loops
- **NEVER put complex expressions in dependency arrays** (like `array.some()`, `object.method`)
- **ALWAYS use functional state updates** to avoid stale closures: `setState(current => newValue)`
- **ALWAYS use primitive values or stable references** in dependency arrays
- **ALWAYS move complex logic inside useEffect**, not in the dependency array
- **ALWAYS use useCallback** for functions that must be in dependencies
- **ALWAYS use refs** for values that don't need to trigger re-renders

## Development Environment Rules 🌐
- **Local development URL**: Always use `https://photobooth-local.sogni.ai` (NOT localhost:5175)
- **Terminal instances**: NEVER spawn new terminal instances - the application is already running externally to Cursor
- **Server management**: Do NOT use `npm run dev` or start/stop servers - they're managed outside Cursor
- **Testing**: Use the live local development URL for testing changes

## General Rules
- You may ask me follow up questions until you are at least 95% certain you can complete the task well and then continue.
- Never rewrite or delete files unless I explicitly ask.
- If a change breaks TypeScript / ESLint / tests, STOP and ask me first.
- When refactoring, move only one logical unit (component / hook / util) per step.
- Preserve import paths & CSS class names exactly.
- Always use 2 space soft tabs. Check and enforce all project lint rules against new code like no-trailing-spaces.
- **Always check CSS specificity when editing CSS** - use proper specificity calculations, not redundant selectors.