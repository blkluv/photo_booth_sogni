# Cursor Rules for Sogni Photobooth Project

## CSS Modification Protocol (MANDATORY)

**CRITICAL RULE: Before making ANY CSS changes, you MUST:**

1. **SCAN ALL FILES** (not just .css) for existing rules that could conflict:
   - **ALL CSS files**: Use `grep` across entire `src/` directory
   - **INLINE STYLES**: Search for `style={{` in JSX/TSX files
   - **CSS-IN-JS**: Search for CSS properties in JavaScript objects
   - **COMPONENT STYLES**: Search for CSS modules, styled-components
   - **DYNAMIC STYLES**: Search for programmatic style setting

2. **COMPREHENSIVE SEARCH COMMANDS**:
   ```bash
   # Search ALL files for CSS property (not just .css)
   grep -r "opacity" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.css"
   grep -r "placeholder" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.css"
   grep -r "style.*opacity" src/
   grep -r "\.style\.opacity" src/
   grep -r "opacity:" src/
   ```

3. **ANALYZE CSS SPECIFICITY** for every conflicting rule found:
   - Calculate specificity scores (IDs=100, Classes=10, Elements=1, !important=1000)
   - **Inline styles = 1000** (same as !important)
   - Identify which rules will actually take precedence
   - Document all conflicting rules before making changes

4. **DOCUMENT CONFLICTS** in your response:
   - List ALL conflicting CSS rules found (CSS files + inline styles + JS)
   - Show file paths and line numbers for every conflict
   - Explain why your new rule will/won't override existing ones
   - Show specificity calculations when needed

5. **USE SURGICAL PRECISION**:
   - Only add the minimum specificity needed to override conflicts
   - Account for inline styles (specificity 1000)
   - Prefer more specific selectors over `!important` when possible

6. **VERIFY NO SIDE EFFECTS**:
   - Check if your changes affect other components using similar selectors
   - Test that your changes don't break existing functionality
   - Consider responsive breakpoints and state variations

## Example COMPLETE CSS Analysis Required:

Before changing `.placeholder { opacity: 0.5; }`, you must:

```bash
# Search ALL file types for opacity and placeholder
grep -r "opacity" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.css"
grep -r "placeholder" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.css"
grep -r "style.*opacity" src/
grep -r "\.style\.opacity" src/
grep -r "style={{.*opacity" src/
```

Then document findings like:
- `film-strip.css:648` sets `.film-frame.newly-arrived .placeholder { opacity: 0.3 !important }` (Specificity: 1030)
- `PhotoGallery.jsx:35` sets `style={{ opacity: 0.25 }}` (Specificity: 1000 - inline style)
- `SomeComponent.tsx:42` sets `element.style.opacity = "0.5"` (Specificity: 1000 - programmatic)
- New rule needs specificity > 1030 to override ALL conflicts

## Enforcement

- **NO CSS changes without this analysis**
- **Document your grep searches in every CSS modification**
- **Show specificity calculations when conflicts exist**
- **This prevents the "million overrides" problem**

---

## General Rules

- Never rewrite or delete files unless explicitly asked
- If a change breaks TypeScript / ESLint / tests, STOP and ask first
- When refactoring, move only one logical unit per step
- Preserve import paths & CSS class names exactly
- Always use 2 space soft tabs
- Check and enforce all project lint rules