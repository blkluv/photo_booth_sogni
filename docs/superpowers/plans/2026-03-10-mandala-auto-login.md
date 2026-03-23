# Mandala Auto-Login Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When users visit `mandala.sogni.ai`, automatically use the `mandalasg` backend account for all image generation with no login/signup UI shown.

**Architecture:** Backend gets a second global SDK client authenticated with mandala credentials, selected via origin header detection. Frontend auto-enters demo mode on event domains (all requests through backend proxy) and suppresses all auth UI.

**Tech Stack:** Node.js/Express backend, React 18 + TypeScript frontend, Sogni Client SDK

**Spec:** `docs/superpowers/specs/2026-03-10-mandala-auto-login-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Verify exists | `src/utils/eventDomains.ts` | Domain detection helpers (already created) |
| Modify | `src/context/AppContext.tsx:28-37` | Replace `DOMAIN_THEME_MAP`/`getThemeForDomain` with imports from eventDomains |
| Modify | `src/services/sogniAuth.ts:40-70` | Auto-demo mode, ensureClient guard, tab sync suppression |
| Modify | `src/App.jsx` (multiple locations) | Hide auth UI, intercept out-of-credits, neutralize error strings |
| Modify | `server/.env.example` | Add `MANDALA_SOGNI_USERNAME`/`MANDALA_SOGNI_PASSWORD` |
| Modify | `server/.env` | Add mandala credentials (out-of-band) |
| Modify | `server/services/sogni.js:15-63,282-393` | Mandala global client, session keying, validateAuthError |
| Modify | `server/routes/sogni.js:502-920,1083-1320` | Origin detection helper, pass `isMandala` to `getSessionClient` |

---

## Chunk 1: Frontend Domain Detection Utility

### Task 1: Verify `src/utils/eventDomains.ts` exists and refactor AppContext

**Files:**
- Verify exists: `src/utils/eventDomains.ts` (already created with `isEventDomain` and `getEventThemeForDomain`)
- Modify: `src/context/AppContext.tsx:28-37,42,293,497`

**Note:** `src/utils/eventDomains.ts` already exists with the correct content. `App.jsx` already imports `isEventDomain` at line 35 and the AuthStatus guard at line 10414 is already in place. This task only refactors AppContext to use the shared utility.

- [ ] **Step 1: Add import to AppContext.tsx and remove duplicated code**

At the top of `AppContext.tsx`, add the import (near line 8, after existing imports):
```typescript
import { getEventThemeForDomain } from '../utils/eventDomains';
```

Then remove lines 28-37 (the `DOMAIN_THEME_MAP` constant and `getThemeForDomain` function):
```typescript
// DELETE these lines:
// const DOMAIN_THEME_MAP: Record<string, string> = {
//   'mandala.sogni.ai': 'mandala',
// };
// const getThemeForDomain = (): string | null => {
//   if (typeof window === 'undefined') return null;
//   return DOMAIN_THEME_MAP[window.location.hostname] || null;
// };
```

- [ ] **Step 2: Replace all `getThemeForDomain()` calls with `getEventThemeForDomain()`**

There are 3 call sites in AppContext.tsx:
1. Line ~42 in `getTezDevThemeFromCookie`: `const domainTheme = getThemeForDomain();` → `const domainTheme = getEventThemeForDomain();`
2. Line ~293 in `updateSetting`: `const domainTheme = getThemeForDomain();` → `const domainTheme = getEventThemeForDomain();`
3. Line ~497 in `resetSettings`: `tezdevTheme: getThemeForDomain() || DEFAULT_SETTINGS.tezdevTheme` → `tezdevTheme: getEventThemeForDomain() || DEFAULT_SETTINGS.tezdevTheme`

- [ ] **Step 3: Verify TypeScript compiles and lint passes**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npx tsc --noEmit --pretty 2>&1 | head -20 && npm run lint 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "refactor: use eventDomains utility in AppContext instead of local DOMAIN_THEME_MAP"
```

## Chunk 2: Frontend Auto-Demo Mode

### Task 2: Modify sogniAuth.ts for event domain auto-demo

**Files:**
- Modify: `src/services/sogniAuth.ts:1,40-70,381-409,424-446`

- [ ] **Step 1: Add import at top of file**

After line 4 (`import { tabSync } from './tabSync';`), add:
```typescript
import { isEventDomain } from '../utils/eventDomains';
```

- [ ] **Step 2: Suppress tab sync in constructor (lines 40-54)**

Replace the constructor body:
```typescript
  constructor() {
    // Initialize on construction
    this.initializationPromise = this.initialize();

    // Setup tab synchronization listener (skip on event domains)
    if (!isEventDomain()) {
      tabSync.onNewTabDetected((newTabDetected) => {
        if (newTabDetected && this.authState.isAuthenticated) {
          console.log('🔄 New authenticated tab detected, setting session transfer flag');
          this.setAuthState({
            sessionTransferred: true,
            error: 'Your Photobooth Session has been transferred to a new tab. Please refresh the browser to resume in this tab.'
          });
        }
      });
    }
  }
```

- [ ] **Step 3: Add event domain early return in initialize() (lines 57-70)**

Replace the `initialize()` method:
```typescript
  private async initialize(): Promise<void> {
    try {
      // On event domains, skip auth entirely and use demo mode
      if (isEventDomain()) {
        this.setAuthState({
          isAuthenticated: true,
          authMode: 'demo',
          user: null,
          isLoading: false,
          error: null,
          sessionTransferred: false
        });
        return;
      }

      this.setAuthState({ isLoading: true, error: null });

      // Check for existing session first
      await this.checkExistingSession();
    } catch (error) {
      console.error('Failed to initialize auth manager:', error);
      this.setAuthState({
        error: error instanceof Error ? error.message : 'Failed to initialize authentication',
        isLoading: false
      });
    }
  }
```

- [ ] **Step 4: Guard ensureClient() with throw (lines 381-409)**

Add at the very beginning of `ensureClient()`, before the existing `if (this.sogniClient)` check:
```typescript
  async ensureClient(): Promise<SogniClient> {
    if (isEventDomain()) {
      throw new Error('Frontend SDK client not available on event domains');
    }

    if (this.sogniClient) {
      return this.sogniClient;
    }
    // ... rest unchanged
```

- [ ] **Step 5: Guard setAuthenticatedState() (lines 424-446)**

Add at the beginning of `setAuthenticatedState()`:
```typescript
  setAuthenticatedState(username: string, email?: string): void {
    if (isEventDomain()) return;

    if (!this.sogniClient) {
      // ... rest unchanged
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/services/sogniAuth.ts
git commit -m "feat: auto-enter demo mode on event domains, guard ensureClient and tab sync"
```

## Chunk 3: Frontend Auth UI Suppression

### Task 3: Hide auth UI in App.jsx

**Files:**
- Modify: `src/App.jsx` (multiple locations)

**Note:** `isEventDomain` is already imported at line 35 and the AuthStatus wrapper already has `!isEventDomain()` at line 10414. Skip those steps.

- [ ] **Step 1: Add belt-and-suspenders to demo render limits (line ~9040)**

Change from:
```javascript
if (!authState.isAuthenticated && hasDoneDemoRender()) {
```
to:
```javascript
if (!authState.isAuthenticated && !isEventDomain() && hasDoneDemoRender()) {
```

Do the same at the second location (line ~9721).

- [ ] **Step 2: Suppress LoginUpsellPopup (line ~10901)**

Change from:
```jsx
<LoginUpsellPopup
  isOpen={showLoginUpsellPopup && currentPage !== 'prompts'}
```
to:
```jsx
<LoginUpsellPopup
  isOpen={showLoginUpsellPopup && currentPage !== 'prompts' && !isEventDomain()}
```

- [ ] **Step 3: Suppress PromoPopup (line ~10872)**

Change from:
```jsx
<PromoPopup
  isOpen={showPromoPopup}
```
to:
```jsx
<PromoPopup
  isOpen={showPromoPopup && !isEventDomain()}
```

- [ ] **Step 4: Intercept handleOutOfCreditsShow (line ~1121)**

Change from:
```javascript
const handleOutOfCreditsShow = useCallback(() => {
  if (canClaimDailyBoost && authState.isAuthenticated) {
```
to:
```javascript
const handleOutOfCreditsShow = useCallback(() => {
  if (isEventDomain()) {
    showToast({ type: 'warning', title: 'Out of credits', message: 'Please try again later', timeout: 5000 });
    return;
  }
  if (canClaimDailyBoost && authState.isAuthenticated) {
```

- [ ] **Step 5: Guard handleDailyBoostFromCreditsDismiss (line ~1138)**

Change from:
```javascript
const handleDailyBoostFromCreditsDismiss = useCallback(() => {
  setShowDailyBoostFromCredits(false);
  if (!lastClaimSuccess) {
    // User declined the boost — show the regular out-of-credits popup
    setShowOutOfCreditsPopup(true);
  }
```
to:
```javascript
const handleDailyBoostFromCreditsDismiss = useCallback(() => {
  setShowDailyBoostFromCredits(false);
  if (!lastClaimSuccess && !isEventDomain()) {
    // User declined the boost — show the regular out-of-credits popup
    setShowOutOfCreditsPopup(true);
  }
```

- [ ] **Step 6: Suppress /signup route handler (line ~1452)**

Change from:
```javascript
useEffect(() => {
  const pendingSignup = sessionStorage.getItem('pendingSignup');
  if (pendingSignup === 'true') {
```
to:
```javascript
useEffect(() => {
  if (isEventDomain()) return;
  const pendingSignup = sessionStorage.getItem('pendingSignup');
  if (pendingSignup === 'true') {
```

- [ ] **Step 7: Guard onOpenLoginModal props to PhotoGallery (lines ~7706 and ~10800)**

At both locations, change from:
```jsx
onOpenLoginModal={() => authStatusRef.current?.openLoginModal()}
```
to:
```jsx
onOpenLoginModal={isEventDomain() ? undefined : () => authStatusRef.current?.openLoginModal()}
```

- [ ] **Step 8: Neutralize credit error strings in photo cards**

There are 9 locations where credit-related error messages are set. Create a helper near the top of the component (after imports):

```javascript
// Neutralize credit error messages on event domains
const getCreditErrorMessage = () => isEventDomain() ? 'Generation unavailable' : undefined;
```

Then at each of these lines, wrap the error message:
- Line ~5531: `error: getCreditErrorMessage() || 'INSUFFICIENT CREDITS',`
- Line ~6176: `error: getCreditErrorMessage() || 'INSUFFICIENT CREDITS',`
- Line ~6285: `errorMessage = getCreditErrorMessage() || 'GENERATION FAILED: replenish tokens';`
- Line ~6298: `errorMessage = getCreditErrorMessage() || 'GENERATION FAILED: replenish tokens';`
- Line ~6307: `errorMessage = getCreditErrorMessage() || 'GENERATION FAILED: replenish tokens';`
- Line ~6698: `errorMessage = getCreditErrorMessage() || 'INSUFFICIENT FUNDS: replenish tokens';`
- Line ~6704: `errorMessage = getCreditErrorMessage() || 'INSUFFICIENT FUNDS: replenish tokens';`
- Line ~6722: `errorMessage = getCreditErrorMessage() || 'INSUFFICIENT FUNDS: replenish tokens';`
- Line ~6838: `errorMessage = getCreditErrorMessage() || 'GENERATION FAILED: replenish tokens';`

- [ ] **Step 9: Run lint and useEffect validation**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npm run lint 2>&1 | tail -10 && npm run validate:useeffect 2>&1 | tail -10`
Expected: 0 warnings, validation passes

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "feat: suppress all auth UI and credit error messages on event domains"
```

## Chunk 4: Backend Environment and Mandala Client

### Task 4: Add mandala credentials to environment

**Files:**
- Modify: `server/.env.example`
- Modify: `server/.env`

- [ ] **Step 1: Add env vars to .env.example**

Append after `SOGNI_ENV=production`:
```
# Mandala Club event credentials (mandala.sogni.ai)
MANDALA_SOGNI_USERNAME=
MANDALA_SOGNI_PASSWORD=
```

- [ ] **Step 2: Add actual credentials to .env**

Add the mandala credentials (configured out-of-band — not stored in this document). The variable names are `MANDALA_SOGNI_USERNAME` and `MANDALA_SOGNI_PASSWORD`.

- [ ] **Step 3: Commit (.env.example only — .env is gitignored)**

```bash
git add server/.env.example
git commit -m "feat: add mandala event credentials to .env.example"
```

### Task 5: Add mandala global client to `server/services/sogni.js`

**Files:**
- Modify: `server/services/sogni.js:15-63,115-226,282-393`

- [ ] **Step 1: Add mandala module-level state (after line 23)**

After the existing `let authLoginPromise = null;` line, add:

```javascript
// Mandala Club event client (separate credentials, separate lifecycle)
let mandalaGlobalSogniClient = null;
let mandalaClientCreationPromise = null;
let mandalaUsername = null;
let mandalaPassword = null;
let mandalaAuthLoginPromise = null;
const mandalaLastRefreshAttempt = { timestamp: 0 };
```

- [ ] **Step 2: Add `getOrCreateMandalaGlobalSogniClient()` function**

Add this new function after the `getOrCreateGlobalSogniClient()` function (after line ~226):

```javascript
// Create or get the Mandala-specific global Sogni client
async function getOrCreateMandalaGlobalSogniClient() {
  if (mandalaGlobalSogniClient && mandalaGlobalSogniClient.account.currentAccount.isAuthenicated) {
    console.log(`[MANDALA] Reusing existing authenticated mandala client: ${mandalaGlobalSogniClient.appId}`);
    recordClientActivity(mandalaGlobalSogniClient.appId);
    return mandalaGlobalSogniClient;
  }

  if (mandalaClientCreationPromise) {
    console.log(`[MANDALA] Client creation already in progress, waiting...`);
    return await mandalaClientCreationPromise;
  }

  mandalaClientCreationPromise = (async () => {
    try {
      if (!mandalaUsername || !mandalaPassword) {
        if (!sogniEnv) sogniEnv = process.env.SOGNI_ENV || 'production';
        if (!sogniUrls) sogniUrls = getSogniUrls(sogniEnv);
        mandalaUsername = process.env.MANDALA_SOGNI_USERNAME;
        mandalaPassword = process.env.MANDALA_SOGNI_PASSWORD;

        if (!mandalaUsername || !mandalaPassword) {
          throw new Error('Mandala credentials not configured - check MANDALA_SOGNI_USERNAME and MANDALA_SOGNI_PASSWORD');
        }
      }

      const clientAppId = `mandala-${uuidv4()}`;
      console.log(`[MANDALA] Creating new mandala Sogni client with app ID: ${clientAppId}`);

      if (!SogniClient) {
        const sogniModule = await import('@sogni-ai/sogni-client');
        SogniClient = sogniModule.SogniClient;
      }

      const client = await SogniClient.createInstance({
        appId: clientAppId,
        network: 'fast',
        restEndpoint: sogniUrls.rest,
        socketEndpoint: sogniUrls.socket,
        testnet: sogniEnv === 'local' || sogniEnv === 'staging'
      });

      // Serialize login with its own lock (independent from default client)
      if (mandalaAuthLoginPromise) {
        try { await mandalaAuthLoginPromise; } catch (e) { /* ignore */ }
      }
      mandalaAuthLoginPromise = (async () => {
        await client.account.login(mandalaUsername, mandalaPassword, false);
      })();
      try {
        await mandalaAuthLoginPromise;
      } finally {
        mandalaAuthLoginPromise = null;
      }

      console.log(`[MANDALA] Successfully authenticated mandala client: ${clientAppId}`);

      if (client.apiClient && client.apiClient.on) {
        client.apiClient.on('connected', () => {
          recordClientActivity(clientAppId);
          console.log(`[MANDALA] Mandala client connected to Sogni`);
        });
        client.apiClient.on('disconnected', () => {
          recordClientActivity(clientAppId);
          console.log(`[MANDALA] Mandala client disconnected from Sogni`);
        });
        client.apiClient.on('error', (error) => {
          recordClientActivity(clientAppId);
          console.log(`[MANDALA] Mandala client socket error:`, error.message);
        });
      }

      mandalaGlobalSogniClient = client;
      activeConnections.set(clientAppId, client);
      recordClientActivity(clientAppId);
      logConnectionStatus('Created', clientAppId);

      return mandalaGlobalSogniClient;
    } catch (error) {
      console.error(`[MANDALA] Failed to create mandala client:`, error);
      throw error;
    } finally {
      mandalaClientCreationPromise = null;
    }
  })();

  return await mandalaClientCreationPromise;
}
```

- [ ] **Step 3: Add mandala error recovery functions**

Add after the existing `forceAuthReset()` function (after line ~324):

```javascript
export function clearMandalaInvalidTokens() {
  console.log('[MANDALA-AUTH] Clearing mandala client due to invalid tokens');
  if (mandalaGlobalSogniClient) {
    try {
      mandalaGlobalSogniClient.account.logout().catch(() => {});
    } catch (error) {
      // Ignore errors during logout
    }
    if (activeConnections.has(mandalaGlobalSogniClient.appId)) {
      activeConnections.delete(mandalaGlobalSogniClient.appId);
      connectionLastActivity.delete(mandalaGlobalSogniClient.appId);
    }
    mandalaGlobalSogniClient = null;
    mandalaClientCreationPromise = null;
  }
}

export async function forceMandalaAuthReset() {
  console.log('[MANDALA-AUTH] Force clearing mandala client and re-authenticating');
  if (mandalaGlobalSogniClient) {
    try {
      await mandalaGlobalSogniClient.account.logout();
    } catch (error) {
      console.log('[MANDALA-AUTH] Logout error during force reset (expected):', error.message);
    }
    if (activeConnections.has(mandalaGlobalSogniClient.appId)) {
      activeConnections.delete(mandalaGlobalSogniClient.appId);
      connectionLastActivity.delete(mandalaGlobalSogniClient.appId);
    }
    mandalaGlobalSogniClient = null;
    mandalaClientCreationPromise = null;
  }
  console.log('[MANDALA-AUTH] Force auth reset completed - next request will re-authenticate');
}
```

- [ ] **Step 4: Modify `validateAuthError` to accept `isMandala` (line ~34)**

Replace the entire `validateAuthError` function:

```javascript
export async function validateAuthError(error, isMandala = false) {
  const clientLabel = isMandala ? 'MANDALA-AUTH' : 'AUTH';
  console.log(`[${clientLabel}] Validating error to determine if it's truly an auth issue: ${error.message}`);

  const refreshAttempt = isMandala ? mandalaLastRefreshAttempt : lastRefreshAttempt;
  const now = Date.now();
  if (now - refreshAttempt.timestamp < REFRESH_COOLDOWN_MS) {
    console.log(`[${clientLabel}] Within refresh cooldown period, treating as auth error`);
    return true;
  }

  try {
    const client = isMandala
      ? await getOrCreateMandalaGlobalSogniClient()
      : await getOrCreateGlobalSogniClient();
    await client.account.refreshBalance();

    console.log(`[${clientLabel}] Error doesn't appear to be auth-related, treating as transient: ${error.message}`);
    return false;
  } catch (validationError) {
    if (validationError.status === 401 ||
        (validationError.payload && validationError.payload.errorCode === 107) ||
        validationError.message?.includes('Invalid token')) {
      console.log(`[${clientLabel}] Validation confirmed this is a real auth error: ${validationError.message}`);
      refreshAttempt.timestamp = now;
      return true;
    }

    console.log(`[${clientLabel}] Validation call failed with non-auth error, treating original error as transient: ${validationError.message}`);
    return false;
  }
}
```

- [ ] **Step 5: Modify `getSessionClient` to accept `isMandala` (line ~369)**

Replace the entire `getSessionClient` function:

```javascript
export async function getSessionClient(sessionId, clientAppId, isMandala = false) {
  const clientLabel = isMandala ? 'MANDALA-SESSION' : 'SESSION';
  const sessionKey = isMandala ? `${sessionId}:mandala` : `${sessionId}:default`;
  console.log(`[${clientLabel}] Getting client for session ${sessionId}${clientAppId ? ` appId ${clientAppId}` : ''}`);
  try {
    console.log(`[${clientLabel}] Using ${isMandala ? 'mandala' : 'global'} SDK instance (clientAppId: ${clientAppId || 'none'})`);
    const client = isMandala
      ? await getOrCreateMandalaGlobalSogniClient()
      : await getOrCreateGlobalSogniClient();
    sessionClients.set(sessionKey, client.appId);
    console.log(`[${clientLabel}] Successfully provided client to session ${sessionId}`);
    return client;
  } catch (error) {
    console.error(`[${clientLabel}] Failed to get client for session ${sessionId}:`, error);
    throw error;
  }
}
```

- [ ] **Step 6: Modify `disconnectSessionClient` to handle composite keys (line ~385)**

Replace the `disconnectSessionClient` function to clean up both possible key formats:

```javascript
export async function disconnectSessionClient(sessionId) {
  console.log(`[SESSION] Disconnecting session client for session ${sessionId}`);

  // Clean up both possible composite keys (default and mandala)
  sessionClients.delete(`${sessionId}:default`);
  sessionClients.delete(`${sessionId}:mandala`);
  // Also delete bare sessionId for backward compatibility during rollout
  sessionClients.delete(sessionId);

  console.log(`[SESSION] Session ${sessionId} disconnected (global client remains active)`);
  return true;
}
```

- [ ] **Step 7: Update the import in routes (line 2 of `server/routes/sogni.js`)**

Add `clearMandalaInvalidTokens` to the import:
```javascript
import { getClientInfo, generateImage, cleanupSogniClient, getSessionClient, disconnectSessionClient, getActiveConnectionsCount, checkIdleConnections, activeConnections, sessionClients, clearInvalidTokens, clearMandalaInvalidTokens, validateAuthError } from '../services/sogni.js';
```

- [ ] **Step 8: Verify server starts without errors**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth/server && timeout 10 node index.js 2>&1 | head -20 || true`
Expected: Server starts, no import errors

- [ ] **Step 9: Commit**

```bash
git add server/services/sogni.js server/routes/sogni.js
git commit -m "feat: add mandala global SDK client with separate auth lifecycle"
```

## Chunk 5: Backend Route Origin Detection

### Task 6: Add origin detection and wire up routes

**Files:**
- Modify: `server/routes/sogni.js:502-920,1083-1320`

- [ ] **Step 1: Add `isMandalaOrigin` helper at the top of the file**

After the existing `const DISCONNECT_CACHE_TTL = 3000;` line (around line 36), add:

```javascript
// Detect if request originates from the Mandala Club domain
function isMandalaOrigin(req) {
  const origin = req.headers.origin;
  if (origin === 'https://mandala.sogni.ai') return true;
  const referer = req.headers.referer;
  if (referer && referer.startsWith('https://mandala.sogni.ai/')) return true;
  return false;
}
```

- [ ] **Step 2: Wire up `POST /cancel/:projectId` (line ~502)**

Change line 511 from:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId);
```
to:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId, isMandalaOrigin(req));
```

- [ ] **Step 3: Wire up `POST /estimate-cost` (line ~534)**

Change line 554 from:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId);
```
to:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId, isMandalaOrigin(req));
```

- [ ] **Step 4: Wire up `POST /generate` — capture and propagate isMandala (line ~583)**

At the top of the handler (after line 595 where `clientAppId` logging occurs), add:
```javascript
const isMandala = isMandalaOrigin(req);
```

Change line 851 from:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId);
```
to:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId, isMandala);
```

Change line 883 (validateAuthError call) from:
```javascript
const isRealAuthError = await validateAuthError(error);
```
to:
```javascript
const isRealAuthError = await validateAuthError(error, isMandala);
```

Change line 889 (clearInvalidTokens call) from:
```javascript
clearInvalidTokens();
```
to:
```javascript
if (isMandala) {
  clearMandalaInvalidTokens();
} else {
  clearInvalidTokens();
}
```

Update the retry path's session cleanup (lines 893-901) to use composite key:
```javascript
const sessionId = req.sessionId;
const sessionKey = isMandala ? `${sessionId}:mandala` : `${sessionId}:default`;
if (sessionId && sessionClients.has(sessionKey)) {
  const clientId = sessionClients.get(sessionKey);
  console.log(`[${localProjectId}] Forcing cleanup of client ${clientId} due to auth error`);
  cleanupSogniClient(clientId);
  sessionClients.delete(sessionKey);
}
```

Change line 907 (retry getSessionClient) from:
```javascript
const freshClient = await getSessionClient(sessionId, clientAppId);
```
to:
```javascript
const freshClient = await getSessionClient(sessionId, clientAppId, isMandala);
```

- [ ] **Step 5: Wire up `POST /generate-angle` — capture and propagate isMandala (line ~1083)**

At the top of the handler (after line 1093 where `clientAppId` is resolved), add:
```javascript
const isMandala = isMandalaOrigin(req);
```

Change line 1246 from:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId);
```
to:
```javascript
const client = await getSessionClient(req.sessionId, clientAppId, isMandala);
```

Change line 1306 (clearInvalidTokens call) from:
```javascript
clearInvalidTokens();
```
to:
```javascript
if (isMandala) {
  clearMandalaInvalidTokens();
} else {
  clearInvalidTokens();
}
```

Update the retry path's session cleanup (lines 1309-1312) to use composite key:
```javascript
const sessionId = req.sessionId;
const sessionKey = isMandala ? `${sessionId}:mandala` : `${sessionId}:default`;
if (sessionId && sessionClients.has(sessionKey)) {
  const clientId = sessionClients.get(sessionKey);
  cleanupSogniClient(clientId);
  sessionClients.delete(sessionKey);
}
```

Change line 1316 (retry getSessionClient) from:
```javascript
const freshClient = await getSessionClient(sessionId, clientAppId);
```
to:
```javascript
const freshClient = await getSessionClient(sessionId, clientAppId, isMandala);
```

- [ ] **Step 6: Verify server starts and lint is clean**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth/server && timeout 10 node index.js 2>&1 | head -20 || true`
Expected: Server starts, no errors

- [ ] **Step 7: Commit**

```bash
git add server/routes/sogni.js
git commit -m "feat: route mandala.sogni.ai requests to mandala SDK client via origin detection"
```

## Chunk 6: Validation

### Task 7: End-to-end validation

- [ ] **Step 1: Run full lint**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npm run lint`
Expected: 0 warnings

- [ ] **Step 2: Run useEffect validation**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npm run validate:useeffect`
Expected: Pass

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Run tests**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npm test -- --passWithNoTests`
Expected: All tests pass

- [ ] **Step 5: Build check**

Run: `cd /Users/markledford/Documents/git/sogni-photobooth && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 6: Manual verification checklist**

Verify on `mandala.sogni.ai` (or by temporarily modifying `/etc/hosts`):
1. No login/signup button visible
2. No AuthStatus component rendered
3. Can take a photo and generate without being prompted to login
4. No demo render limit (can generate multiple times)
5. No promo popup appears
6. If credits run out, a toast appears (not the full OutOfCreditsPopup)
7. Error cards show "Generation unavailable" not "replenish tokens"
8. On regular `photobooth.sogni.ai`, everything works as before (regression check)
