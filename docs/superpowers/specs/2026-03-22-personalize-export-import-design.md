# Personalize Export/Import Design

## Summary

Add Export and Import functionality to the Vibe Explorer Personalize tab. Export generates a zip file containing all saved custom prompts (metadata + preview images). Import accepts that same zip to replace the current personalized list.

## Decisions

- **Mostly client-side** — no new server endpoints, but one minimal backend change to handle `data:` URLs in the existing save endpoint.
- **Zip format** — `prompts.json` manifest + image files, built with JSZip (already a project dependency).
- **Import replaces** — importing wipes existing prompts and replaces with zip contents.
- **No negative prompt** — not recorded in export; default is used on import.
- **Buttons near Reset All** — at the bottom of the Personalize tab.

## Zip Format

```
sogni-personalize-vibes.zip
├── prompts.json
├── preview_a1b2c3d4e5f6.jpg
├── preview_f6e5d4c3b2a1.jpg
└── ...
```

Image filenames use the existing hash-based `imageFilename` values (e.g., `preview_abc123.jpg`) to avoid collisions.

### prompts.json

```json
{
  "version": 1,
  "modelType": "image-edit",
  "prompts": [
    {
      "name": "Watercolor Dream",
      "prompt": "a watercolor portrait with soft edges...",
      "imageFilename": "preview_a1b2c3d4e5f6.jpg"
    }
  ]
}
```

- `version` — integer, currently `1`. On import, if version > 1, show error: "This export was created by a newer version. Please update the app."
- `modelType` — `"sd"` or `"image-edit"`. Validated on import; rejected if neither value.
- `prompts[].imageFilename` — matches a file in the zip root. Optional (prompt still imports without an image).

## Export Flow

1. User clicks **Export** button (disabled during operation, shows loading state).
2. Fetch all saved prompts from state (`personalizeSavedPrompts`).
3. For each prompt with an `imageFilename`, fetch the preview image via `getPreviewImageUrl()`.
4. Build zip: write `prompts.json` + image blobs.
5. Trigger browser download as `sogni-personalize-vibes.zip`.
6. Uses same JSZip pattern as `downloadImagesAsZip()` in `bulkDownload.js`.

## Import Flow

1. User clicks **Import** button → triggers hidden `<input type="file" accept=".zip">`.
2. **Confirmation dialog**: "This will replace all N existing vibes. Continue?" (skip if 0 existing).
3. Read selected file as ArrayBuffer, open with JSZip.
4. Parse `prompts.json` — validate `version` field and `prompts` array.
5. For each prompt, extract its image blob from the zip (if `imageFilename` present).
6. Convert image blobs to base64 data URLs for the save API.
7. **Serialized through `personalizeMutexRef`**: Reset existing prompts via `resetCustomPrompts()`, then save imported prompts via `saveCustomPrompts()` with `previewImageUrl` fields.
8. Assign fresh client-side `id` fields to imported prompts via the existing `personalizeIdCounter` pattern.
9. Refresh UI state (re-fetch personalize data).
10. Button shows loading state during the entire operation.

### Image Upload on Import

The existing save endpoint fetches `previewImageUrl` via HTTP. For imported images (local blobs from the zip), we convert them to base64 `data:image/jpeg;base64,...` URLs.

The backend is extended to detect `data:` prefix and decode directly (using the same pattern as `contestService.js:63-70`) rather than HTTP-fetching. This avoids relying on Node.js `fetch` data URL support.

**Express body size**: The personalize route may need an increased JSON body limit to accommodate base64-encoded images inline. A 999-prompt import with ~100KB images each would be ~130MB base64. To handle this, import saves in batches (e.g., 50 prompts per request) to stay within reasonable payload sizes.

## UI Design

At the bottom of the Personalize tab, alongside the existing "Reset All" button:

```
[Export] [Import] [Reset All]
```

- **Export** — disabled when no saved prompts exist or when operation is in progress.
- **Import** — disabled when operation is in progress. Shows confirmation before executing.
- Both use the same button styling as "Reset All".
- Both show loading/disabled state during async operations.

## Files Changed

| File | Change |
|------|--------|
| `src/utils/personalizeExport.ts` | **New** — `exportPersonalizeZip()` and `importPersonalizeZip()` functions |
| `src/components/shared/PhotoGallery.jsx` | Add Export/Import buttons + handlers in Personalize tab |
| `server/routes/personalize.js` | Handle `data:` URLs in `previewImageUrl` during save (for import), using explicit base64 decode pattern from `contestService.js` |

## Validation

- Export with 0 prompts: button disabled, no action.
- Import with malformed zip: show error toast, no state change.
- Import with missing `prompts.json`: show error toast.
- Import with `version` > 1: show error toast "created by newer version."
- Import with invalid `modelType`: show error toast.
- Import with missing image files: import prompts without images (graceful degradation).
- Import prompt count exceeds 999 limit: truncate to 999, warn user.
- Import serialized through personalizeMutexRef to prevent race conditions.
