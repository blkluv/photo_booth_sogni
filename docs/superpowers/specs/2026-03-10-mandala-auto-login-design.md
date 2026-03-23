# Mandala Auto-Login Design

## Problem

When users visit `mandala.sogni.ai`, the Mandala Club theme applies correctly but authentication works like the main site: users see login/signup UI and get a single demo render before upsell. Mandala visitors should instead use a dedicated `mandalasg` backend account automatically, with no auth UI and no render limits.

## Solution: Domain-Aware Backend Client + Frontend Auto-Demo Mode

### Backend Changes

#### Environment Configuration

Add to `server/.env` and `server/.env.example`:

```
MANDALA_SOGNI_USERNAME=
MANDALA_SOGNI_PASSWORD=
```

Actual credentials are configured out-of-band, not stored in documentation.

#### Mandala SDK Client (`server/services/sogni.js`)

Add a second global SDK client dedicated to mandala requests, parallel to the existing `globalSogniClient`:

- **New module-level state:** `mandalaGlobalSogniClient`, `mandalaClientCreationPromise`, `mandalaUsername`, `mandalaPassword`, `mandalaAuthLoginPromise` (separate serialization lock from the default client's `authLoginPromise`)
- **New function `getOrCreateMandalaGlobalSogniClient()`** — mirrors `getOrCreateGlobalSogniClient()` but authenticates with `MANDALA_SOGNI_USERNAME` / `MANDALA_SOGNI_PASSWORD`. Shares `SogniClient` import and `getSogniUrls()`, but uses its own `mandalaClientCreationPromise` and `mandalaAuthLoginPromise` to avoid blocking/racing with the default client.
- **Modify `getSessionClient(sessionId, clientAppId, isMandala)`** — accept a boolean `isMandala` parameter. When true, call `getOrCreateMandalaGlobalSogniClient()`. When false, call `getOrCreateGlobalSogniClient()`. **Key the `sessionClients` map on `sessionId + ':mandala'` or `sessionId + ':default'`** to prevent cross-contamination when the same browser visits both domains (they share the `sogni_session_id` cookie since it's scoped to the API backend, not the frontend domain).
- **Modify `validateAuthError(error, isMandala)`** — accept `isMandala` parameter. When true, test auth validity against the mandala client (call `getOrCreateMandalaGlobalSogniClient()` and `client.account.refreshBalance()`). When false, use the default client. This prevents falsely reporting "not an auth error" when the mandala client's tokens are bad but the default client is fine.
- **Add mandala-specific error recovery:** `clearMandalaInvalidTokens()` and `forceMandalaAuthReset()` so the mandala client can recover independently from auth failures.
- **Export** the new functions for use in routes.

Both clients register callbacks in the shared `activeProjectCallbacks` map. This is safe because callbacks are keyed by `sdkProjectId` which is unique per project, and each client generates projects independently.

#### Origin Detection (`server/routes/sogni.js`)

- **Helper function `isMandalaOrigin(req)`** — uses **exact match**: `req.headers.origin === 'https://mandala.sogni.ai'`, falling back to checking `req.headers.referer` starts with `'https://mandala.sogni.ai/'` (trailing slash prevents partial-match attacks like `mandala.sogni.ai.evil.com`). Returns `false` if both headers are absent (safe default — routes to default client).
- **Routes that call `getSessionClient()` and need the mandala flag:**
  - `POST /generate` (main generation endpoint, line ~583) — including the retry path at line ~907 which re-calls `getSessionClient()`. Capture `isMandala` from the request at the top of the handler and pass it through to retry paths and `validateAuthError()`.
  - `POST /generate-angle` (camera angle generation, line ~1083) — including the retry path at line ~1316. Same capture-and-propagate pattern.
  - `POST /cancel/:projectId` (cancel generation, line ~502)
  - `POST /estimate-cost` (cost estimation, line ~534)

**Routes that do NOT need changes:**
- `GET /progress/:projectId`, `GET /progress/client`, `GET /progress/session` — these manage SSE connections only and do not call `getSessionClient()`.
- `GET /status` and `GET /test-client` — these call `getClientInfo()` which uses the default global client. On event domains, the frontend does not display balance/status info, so returning the default client's info is acceptable.
- `POST /admin/cleanup` — only cleans up the default global client. Acceptable; mandala client lifecycle is independent. Note: if mandala client cleanup is needed in the future, add `cleanupMandalaClient()`.
- `analyzeImageFaces()` in `server/services/sogni.js` — uses the default global client for face analysis. This is acceptable; face analysis is an LLM call, not image generation, and bills the default account.

### Frontend Changes

#### Domain Detection Helper (`src/utils/eventDomains.ts`) — NEW FILE

Extract domain detection into a standalone utility module to avoid circular dependency issues. `sogniAuth.ts` creates its singleton at module load time; if it imported from `AppContext.tsx`, the function could be `undefined` during construction.

```typescript
// Map of alternate domains to their event themes
const EVENT_DOMAIN_MAP: Record<string, string> = {
  'mandala.sogni.ai': 'mandala',
};

export const isEventDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname in EVENT_DOMAIN_MAP;
};

export const getEventThemeForDomain = (): string | null => {
  if (typeof window === 'undefined') return null;
  return EVENT_DOMAIN_MAP[window.location.hostname] || null;
};
```

**Refactor `AppContext.tsx`**: Replace `DOMAIN_THEME_MAP` and `getThemeForDomain()` with imports from `src/utils/eventDomains.ts` (`EVENT_DOMAIN_MAP` and `getEventThemeForDomain()`). This eliminates duplication and ensures a single source of truth.

#### Auto-Demo Mode (`src/services/sogniAuth.ts`)

In `initialize()`, before calling `checkExistingSession()`:

```typescript
import { isEventDomain } from '../utils/eventDomains';

// If on an event domain, skip auth entirely and use demo mode
if (isEventDomain()) {
  this.setAuthState({
    isAuthenticated: true,
    authMode: 'demo',
    user: null,
    isLoading: false,
    error: null,
    sessionTransferred: false
  });
  return; // Skip SDK client creation and session check
}
```

Additionally:
- **Guard `ensureClient()` with a throw**: Add at the top of `ensureClient()`: `if (isEventDomain()) throw new Error('Frontend SDK client not available on event domains');`. Must throw (not return early) to satisfy the `Promise<SogniClient>` return type. Callers are hidden on event domains (auth UI suppressed), so this is defense-in-depth.
- **Guard `setAuthenticatedState()`**: Add `if (isEventDomain()) return;` to prevent accidental tab sync broadcasts that could trigger "session transferred" warnings in other tabs.
- **Suppress tab sync**: In the constructor, skip the `tabSync.onNewTabDetected()` listener setup when `isEventDomain()` is true, since event domain sessions should not be affected by auth state in other tabs.

#### Hide Auth UI (`src/App.jsx`)

1. **AuthStatus wrapper** (line ~10413): Add `isEventDomain()` check:
   ```jsx
   {!showSplashScreen && currentPage !== 'prompts' && !showSplashOnInactivity && !isEventDomain() && (
   ```

2. **Demo render limit bypass** (lines ~9040 and ~9720): Skip `hasDoneDemoRender()` check on event domains. Since `isAuthenticated` is `true` in demo mode, the `!authState.isAuthenticated` check already prevents the upsell. But add `!isEventDomain()` as a belt-and-suspenders guard:
   ```javascript
   if (!authState.isAuthenticated && !isEventDomain() && hasDoneDemoRender()) {
   ```

3. **LoginUpsellPopup**: Don't render on event domains.

4. **PromoPopup**: Don't render on event domains.

5. **Out of credits — `handleOutOfCreditsShow()` interception**: This is the single chokepoint called from 6+ locations (main generation, SSE errors, PhotoGallery enhance, photo refresh, video generation, camera angles). Add `isEventDomain()` as the first check:
   ```javascript
   const handleOutOfCreditsShow = useCallback(() => {
     if (isEventDomain()) {
       showToast({ type: 'warning', title: 'Out of credits', message: 'Please try again later', timeout: 5000 });
       return;
     }
     // ... existing logic
   }, [...]);
   ```
   Also guard `handleDailyBoostFromCreditsDismiss` (line ~1142) which bypasses `handleOutOfCreditsShow()` and directly calls `setShowOutOfCreditsPopup(true)`:
   ```javascript
   if (isEventDomain()) return; // before setShowOutOfCreditsPopup(true)
   ```

6. **`/signup` route suppression**: In the `pendingSignup` handler (line ~1452), skip `authStatusRef.current?.openSignupModal()` when `isEventDomain()` is true.

7. **`onOpenLoginModal` prop to PhotoGallery**: Pass `undefined` on event domains instead of `() => authStatusRef.current?.openLoginModal()` to prevent any code path from opening a login modal.

8. **Neutralize error strings in photo cards**: On event domains, map Sogni-specific credit error messages (`'INSUFFICIENT FUNDS: replenish tokens'`, `'INSUFFICIENT CREDITS'`, `'GENERATION FAILED: replenish tokens'`) to a neutral `'Generation unavailable — please try again later'`.

#### Auth UI Leak Analysis

The following auth-related UI elements are **already safe** on event domains because `authState.isAuthenticated` is `true` and/or `authMode` is `'demo'`:

- **Info Modal signup button** — gated on `!authState.isAuthenticated`, hidden in demo mode
- **Video generation login gate** (PhotoGallery) — gated on `!isAuthenticated`, bypassed in demo mode
- **StripePurchase modal** — gated on `authMode === 'frontend'`, never triggered in demo mode
- **`triggerPromoPopupIfNeeded()`** — checks `authState.isAuthenticated`, skipped in demo mode
- **SoundToVideoPopup / MusicGeneratorModal "Sign in" gates** — gated on `!isAuthenticated`, hidden in demo mode
- **PhotoGallery "Bald for Base" auth gate** — gated on `!isAuthenticated`, not triggered in demo mode
- **ContestVote login gate** — gated on `!isAuthenticated`, hidden; page not reachable from event domains
- **AdvancedSettings Worker Preferences** — gated on `authMode === 'frontend'`, hidden in demo mode
- **AuthStatus DailyBoostCelebration** (separate instance from App.jsx) — naturally suppressed because `getSogniClient()` returns null so RewardsContext never loads rewards, `canClaimDailyBoost` stays false. The AuthStatus wrapper is also hidden via `isEventDomain()` check.
- **Session Transferred overlay** — suppressed by skipping `tabSync.onNewTabDetected()` listener in constructor, so `sessionTransferred` is never set to `true`
- **Email verification toasts** — frontend SDK client is never created on event domains so frontend-side 4052 errors cannot fire. Backend mandalasg account should be pre-verified.

### What Doesn't Change

- Theme/branding CSS injection (already works via `themeConfigService`)
- Mandala meta tag injection in `server/index.js` (already works)
- `DOMAIN_THEME_MAP` and theme locking in `AppContext.tsx` (refactored to import from `eventDomains.ts` but same behavior)
- SSE progress streaming architecture (unchanged, just uses different SDK client)
- The default `SOGNI_USERNAME`/`SOGNI_PASSWORD` backend client (unchanged, still serves `photobooth.sogni.ai`)

### Credit Depletion Behavior

When the `mandalasg` account runs out of credits, the backend returns a generation error. The frontend intercepts at `handleOutOfCreditsShow()` and shows a toast: "Out of credits — please try again later". No OutOfCreditsPopup, login/signup/purchase prompts, or `app.sogni.ai/wallet` links are shown.

Photo cards that would normally show `'INSUFFICIENT FUNDS: replenish tokens'` instead show `'Generation unavailable — please try again later'`.

### Security

- Mandala credentials live only in `server/.env`, never exposed to the frontend
- Origin detection uses exact match (`=== 'https://mandala.sogni.ai'`), not substring matching; referer fallback uses `startsWith('https://mandala.sogni.ai/')` with trailing slash to prevent partial-match attacks
- Returns `false` when both Origin and Referer headers are absent (safe default)
- Origin header detection is sufficient for routing since the backend is a proxy — there is no privilege escalation risk (mandalasg is a lower-privilege venue account)
- Origin can be spoofed via curl/Postman but not from browsers; acceptable risk for venue context
- Session cookie (`sogni_session_id`) is shared across domains since it's scoped to the API backend. Session-to-client mapping uses `sessionId + origin context` as key to prevent cross-contamination.
- CORS already allows `mandala.sogni.ai` in `server/index.js`
