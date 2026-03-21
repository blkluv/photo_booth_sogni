# Personalize Mode - Design Spec

## Overview
Add a third "Personalize" mode to Vibe Explorer alongside Simple and Advanced. Users create custom prompts (up to 16), expanded via VLM, with AI-generated preview images. Prompts and images persist per-account via backend API + Redis, enabling cross-kiosk consistency.

## Architecture

### Backend (4 new/modified files)

**1. `server/routes/personalize.js`** — New route file
- `GET /api/personalize/:address` — Fetch saved custom prompts + preview image URLs
- `POST /api/personalize/:address/expand` — VLM prompt expansion (accepts user text, model type, returns structured prompts)
- `POST /api/personalize/:address` — Save custom prompts (array of {name, prompt, negativePrompt, imageFilename})
- `DELETE /api/personalize/:address` — Reset all custom prompts + delete images
- `GET /api/personalize/images/:address/:filename` — Serve stored preview images

**2. `server/services/personalizeService.js`** — New service
- `expandPrompts(userInput, modelType, sogniClient)` — Calls Sogni SDK VLM `chat.completions.create()` with `qwen3.5-35b-a3b-gguf-q4km` model to expand user text into 1-16 structured prompts
- `saveCustomPrompts(address, prompts)` — Persist to Redis
- `getCustomPrompts(address)` — Retrieve from Redis
- `deleteCustomPrompts(address)` — Clear from Redis + filesystem
- `savePreviewImage(address, index, imageBuffer)` — Write to `uploads/personalize/{address}/`
- System prompt for VLM: context-aware (SD vs image-edit model), generates structured JSON with name, prompt text, negativePrompt

**3. `server/services/redisService.js`** — Add personalize helpers
- Prefix: `personalize:prompts:`
- Key format: `personalize:prompts:{address}` → JSON array of custom prompts
- No TTL (persistent until user resets)

**4. `server/index.js`** — Mount new routes at `/api/personalize`

### Frontend (5 new/modified files)

**5. `src/services/personalizeService.ts`** — New frontend service
- `fetchCustomPrompts(address)` → GET from backend
- `expandPrompts(userInput, modelType, address)` → POST to backend, returns expanded prompts
- `saveCustomPrompts(address, prompts)` → POST to backend
- `resetCustomPrompts(address)` → DELETE to backend
- `getPreviewImageUrl(address, filename)` → Construct URL

**6. `src/utils/cookies.ts`** — Update
- `getVibeExplorerMode()` / `saveVibeExplorerMode()` → Support 'simple' | 'advanced' | 'personalize'

**7. `src/constants/themeGroups.js`** — Add dynamic "Personalized" theme group
- Inject `personalized` group with user's custom prompt keys when available
- Add to `getOrderedThemeGroupIds()` (after favorites)
- Default state: enabled when user has custom prompts

**8. `src/components/shared/PhotoGallery.jsx`** — Main UI changes
- Add "Personalize" toggle button alongside Simple/Advanced
- Personalize mode UI:
  - Text input area with placeholder "Describe your vibes... e.g., 'classic photobooth with silly signs and hats'"
  - Model type indicator (SD / Image Edit)
  - "Generate" button → calls expand endpoint → shows loading state
  - Preview source toggle: Your Photo / Einstein / Jen
  - Generated prompts grid with preview images (generated on save)
  - Each card: name, preview image, save/remove buttons
  - Saved prompts section showing current collection (up to 16)
  - "Reset All" button with confirmation
- Login gate: if not authenticated, show message + login button
- Load custom prompts on mode entry if authenticated

**9. `src/services/prompts.js`** — Integrate personalized prompts
- `getSimplePickPrompts()` — When user has custom prompts, use those instead
- Export helper to merge custom prompts into stylePrompts for generation

### Data Flow

```
User types "classic photobooth with silly props" in Personalize mode
  → POST /api/personalize/:address/expand { input, modelType }
  → Backend: Sogni SDK VLM chat.completions.create() with system prompt
  → Returns: [{name: "Vintage Photo Strip", prompt: "Transform into a classic...", negativePrompt: "..."}, ...]
  → Frontend displays expanded prompts as cards
  → User clicks "Save" on each card they want
  → Frontend generates preview image via Sogni SDK (using user photo or Einstein/Jen)
  → Preview image uploaded to POST /api/personalize/:address with prompt data
  → Redis stores prompt data, filesystem stores preview images
  → Custom prompts now appear in Simple mode (replacing defaults) and Advanced mode (as "Personalized" category)
```

### VLM System Prompt (for expand endpoint)

```
You are a creative AI art director specializing in portrait transformation styles.
Given the user's description and target model type, generate structured prompts.

Model type: {SD | Image Edit}
- For SD models: Write detailed scene/style descriptions that work with face-preserving generation
- For Image Edit models: Write edit instructions that modify the photo while preserving identity

Return JSON array:
[{
  "name": "Short display name (2-4 words)",
  "prompt": "Full prompt text optimized for the target model",
  "negativePrompt": "deformed, distorted, bad quality, blurry"
}]

Rules:
- Generate 1-16 prompts based on the user's request
- If user asks for a specific count (e.g., "give me 16"), generate exactly that many
- If user describes a single style, generate 1 prompt
- Each prompt should be distinct and varied
- Names should be catchy and memorable
- Prompts should be 1-3 sentences, detailed but focused
```

### Preview Image Generation
- When user saves a prompt, frontend generates a preview using the Sogni SDK
- Source image: user's last captured photo (from AppContext `photos` array), or Einstein/Jen default based on toggle
- Generated image is uploaded to backend for persistent storage
- Preview source toggle persists in localStorage

### Simple Mode Integration
- When user has saved custom prompts, Simple mode shows ONLY those prompts
- The existing simplePick logic works unchanged — custom prompts get custom promptKeys like `custom_0`, `custom_1`, etc.
- If user resets custom prompts, Simple mode reverts to default behavior

### Advanced Mode Integration
- Custom prompts appear as a "Personalized" theme group
- Group shows after "Favorites" in the ordered list
- Enabled by default when custom prompts exist
