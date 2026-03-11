# Mandala Auto-Login Design

## Problem

When users visit `mandala.sogni.ai`, the Mandala Club theme applies correctly but authentication works like the main site: users see login/signup UI and get a single demo render before upsell. Mandala visitors should instead use a dedicated `mandalasg` backend account automatically, with no auth UI and no render limits.

## Solution: Domain-Aware Backend Client + Frontend Auto-Demo Mode

### Backend Changes

#### Environment Configuration

Add to `server/.env` and `server/.env.example`:

```
MANDALA_SOGNI_USERNAME=mandalasg
MANDALA_SOGNI_PASSWORD=wearemandala69!
```

#### Mandala SDK Client (`server/services/sogni.js`)

Add a second global SDK client dedicated to mandala requests, parallel to the existing `globalSogniClient`:

- **New module-level state:** `mandalaGlobalSogniClient`, `mandalaClientCreationPromise`, `mandalaUsername`, `mandalaPassword`
- **New function `getOrCreateMandalaGlobalSogniClient()`** — mirrors `getOrCreateGlobalSogniClient()` but authenticates with `MANDALA_SOGNI_USERNAME` / `MANDALA_SOGNI_PASSWORD`. Shares `SogniClient` import, `getSogniUrls()`, and the auth serialization pattern (`authLoginPromise`).
- **Modify `getSessionClient(sessionId, clientAppId, isMandala)`** — accept a boolean `isMandala` parameter. When true, return the mandala client. When false, return the default client.
- **Add mandala-specific error recovery:** `clearMandalaInvalidTokens()` and optionally `forceMandalaAuthReset()` so the mandala client can recover independently from auth failures.
- **Export** the new functions for use in routes.

#### Origin Detection (`server/routes/sogni.js`)

- **Helper function `isMandalaOrigin(req)`** — checks `req.headers.origin` or `req.headers.referer` for `mandala.sogni.ai`. Returns boolean.
- **All route handlers that call `getSessionClient()`** pass the mandala flag:
  - `POST /generateImage` (main generation endpoint)
  - `GET /progress/:projectId` (SSE progress stream)
  - `POST /cancel/:projectId` (cancel generation)
  - `POST /estimateCost` (cost estimation)
  - Any other route that uses the SDK client

### Frontend Changes

#### Domain Detection Helper (`src/context/AppContext.tsx`)

Export a new function:

```typescript
export const isEventDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname in DOMAIN_THEME_MAP;
};
```

This is used throughout the frontend to detect event/venue mode.

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

This ensures all generation requests route through the backend proxy (which uses mandala credentials for mandala-origin requests).

#### Hide Auth UI (`src/App.jsx`)

1. **AuthStatus wrapper** (line ~10413): Add `isEventDomain()` check to the render condition:
   ```jsx
   {!showSplashScreen && currentPage !== 'prompts' && !showSplashOnInactivity && !isEventDomain() && (
   ```

2. **Demo render limit bypass** (lines ~9040 and ~9720): Skip `hasDoneDemoRender()` check on event domains:
   ```javascript
   if (!authState.isAuthenticated && !isEventDomain() && hasDoneDemoRender()) {
   ```

3. **LoginUpsellPopup**: Don't render on event domains.

4. **PromoPopup**: Don't render on event domains.

5. **Out of credits**: When on an event domain, show a simple toast "Out of credits - please try again later" instead of login/purchase upsell.

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
- Origin header detection is sufficient for routing since the backend is a proxy — there is no privilege escalation risk (mandalasg is a lower-privilege venue account)
- CORS already allows `mandala.sogni.ai` in `server/index.js`
