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
- **Modify `getSessionClient(sessionId, clientAppId, isMandala)`** — accept a boolean `isMandala` parameter. When true, call `getOrCreateMandalaGlobalSogniClient()`. When false, call `getOrCreateGlobalSogniClient()`.
- **Add mandala-specific error recovery:** `clearMandalaInvalidTokens()` and `forceMandalaAuthReset()` so the mandala client can recover independently from auth failures.
- **Export** the new functions for use in routes.

Both clients register callbacks in the shared `activeProjectCallbacks` map. This is safe because callbacks are keyed by `sdkProjectId` which is unique per project, and each client generates projects independently.

#### Origin Detection (`server/routes/sogni.js`)

- **Helper function `isMandalaOrigin(req)`** — uses **exact match**: `req.headers.origin === 'https://mandala.sogni.ai'`, falling back to checking `req.headers.referer` starts with `'https://mandala.sogni.ai/'`. Returns boolean.
- **Routes that call `getSessionClient()` and need the mandala flag:**
  - `POST /generate` (main generation endpoint, line ~583) — including the retry path at line ~907 which re-calls `getSessionClient()`. Capture `isMandala` from the request at the top and pass it through.
  - `POST /generate-angle` (camera angle generation, line ~1083) — including the retry path at line ~1316. Same capture-and-propagate pattern.
  - `POST /cancel/:projectId` (cancel generation, line ~502)
  - `POST /estimate-cost` (cost estimation, line ~534)

**Routes that do NOT need changes:**
- `GET /progress/:projectId`, `GET /progress/client`, `GET /progress/session` — these manage SSE connections only and do not call `getSessionClient()`.
- `GET /status` and `GET /test-client` — these call `getClientInfo()` which uses the default global client. On event domains, the frontend does not display balance/status info, so returning the default client's info is acceptable.

### Frontend Changes

#### Domain Detection Helper (`src/context/AppContext.tsx`)

Export a new function alongside the existing module-private `DOMAIN_THEME_MAP`:

```typescript
export const isEventDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname in DOMAIN_THEME_MAP;
};
```

This lives in `AppContext.tsx` so it can access `DOMAIN_THEME_MAP` without exporting the map itself.

#### Auto-Demo Mode (`src/services/sogniAuth.ts`)

In `initialize()`, before calling `checkExistingSession()`:

```typescript
import { isEventDomain } from '../context/AppContext';

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
- **Guard `ensureClient()`**: Add an early return or throw at the top of `ensureClient()` when `isEventDomain()` is true, preventing accidental frontend SDK client creation on event domains.
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

5. **DailyBoostCelebration suppression**: In the `handleOutOfCreditsShow()` callback, skip the Daily Boost check when `isEventDomain()` is true. The mandalasg account may have claimable boosts, but venue visitors are not individual account holders and should not see this UI.

6. **`/signup` route suppression**: In the `pendingSignup` handler (line ~1452), skip `authStatusRef.current?.openSignupModal()` when `isEventDomain()` is true.

7. **Out of credits**: When on an event domain, show a simple toast "Out of credits - please try again later" instead of login/purchase upsell.

#### Auth UI Leak Analysis

The following auth-related UI elements are already safe on event domains because `authState.isAuthenticated` is `true` and/or `authMode` is `'demo'`:

- **Info Modal signup button** — gated on `!authState.isAuthenticated`, so hidden in demo mode
- **Video generation login gate** — gated on `!isAuthenticated`, so bypassed in demo mode
- **StripePurchase modal** — gated on `authMode === 'frontend'`, so never triggered in demo mode
- **`triggerPromoPopupIfNeeded()`** — checks `authState.isAuthenticated`, so skipped in demo mode

### What Doesn't Change

- Theme/branding CSS injection (already works via `themeConfigService`)
- Mandala meta tag injection in `server/index.js` (already works)
- `DOMAIN_THEME_MAP` and theme locking in `AppContext.tsx` (already works)
- SSE progress streaming architecture (unchanged, just uses different SDK client)
- The default `SOGNI_USERNAME`/`SOGNI_PASSWORD` backend client (unchanged, still serves `photobooth.sogni.ai`)

### Credit Depletion Behavior

When the `mandalasg` account runs out of credits, the backend will return a generation error. The frontend shows a simple "Out of credits - please try again later" message. No login/signup/purchase prompts are shown.

### Security

- Mandala credentials live only in `server/.env`, never exposed to the frontend
- Origin detection uses exact match (`=== 'https://mandala.sogni.ai'`), not substring matching
- Origin header detection is sufficient for routing since the backend is a proxy — there is no privilege escalation risk (mandalasg is a lower-privilege venue account)
- CORS already allows `mandala.sogni.ai` in `server/index.js`
