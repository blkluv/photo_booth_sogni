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

## Architecture & Concurrent Processing Rules 🏗️
- **🔥 CRITICAL: ONE SDK INSTANCE PER BACKEND** - All clients hitting the same Photobooth Backend share the same global SDK instance
- **🚨 NEVER CONCLUDE SOGNI SDK IS SEQUENTIAL** - It fully supports concurrent projects! Main frontend proves this with 16+ concurrent jobs
- **ALWAYS reference ARCHITECTURE-ROADMAP.md** before making concurrent processing changes
- **NEVER create multiple Sogni SDK instances** for same application/client - main photobooth uses single global instance for ALL operations
- **NEVER create multiple clientAppIds** for concurrent projects - use single shared clientAppId per application/client
- **ALWAYS reuse existing SDK instance** instead of creating new ones for same appId
- **ALWAYS follow the main frontend pattern** for concurrent handling - it's the proven working implementation
- **ALWAYS check for `code: 4015` errors** when debugging concurrent issues (indicates multiple SDK instances conflict)
- **ALWAYS check for "Invalid nonce" errors** when debugging concurrent issues (indicates concurrent SDK creation)

## Debugging & Problem Solving Rules 🔍
- **🚨 CRITICAL: VALIDATE ALL ASSUMPTIONS WITH ACTUAL CODE** - Never make conclusions without examining the source code
- **ALWAYS examine the actual implementation** - Look at the code in node_modules, source files, etc. before concluding anything
- **NEVER assume limitations exist** - Prove limitations by finding them in the actual code
- **ALWAYS add logging to prove/disprove theories** - Instrument the actual code to see what's happening
- **ALWAYS start with symptoms** - analyze error messages, console logs, and network requests FIRST
- **NEVER assume root cause** - trace the actual code execution path before making changes
- **ALWAYS ask for browser dev tools info** when debugging UI issues (console, network tab, elements)
- **ONE hypothesis at a time** - test each theory with minimal changes before moving to next
- **ALWAYS verify the fix** - ensure the change actually resolves the reported issue
- **NEVER apply multiple "solutions"** without confirming each one works
- **ALWAYS trace data flow** - follow variables from creation to usage when debugging
- **STOP and ask for clarification** if symptoms don't match expected behavior
- **ALWAYS check ARCHITECTURE-ROADMAP.md** for known patterns and pitfalls before debugging concurrent issues

## 📚 Key Reference Documents
- **`ARCHITECTURE-ROADMAP.md`** - Authoritative guide for concurrent processing, SSE patterns, and architectural decisions
- **`server/services/sogni.js`** - Core SDK instance management and concurrent project handling
- **`server/routes/sogni.js`** - SSE endpoint routing and event forwarding logic

## General Rules
- You may ask me follow up questions until you are at least 95% certain you can complete the task well and then continue.
- Never rewrite or delete files unless I explicitly ask or it's obvious I want files changed.
- If a change breaks TypeScript / ESLint / tests, fix it.
- When refactoring, move only one logical unit (component / hook / util) per step.
- Preserve import paths & CSS class names exactly.
- Always use 2 space soft tabs. Check and enforce all project lint rules against new code like no-trailing-spaces.
- **Always check CSS specificity when editing CSS** - use proper specificity calculations, not redundant selectors.