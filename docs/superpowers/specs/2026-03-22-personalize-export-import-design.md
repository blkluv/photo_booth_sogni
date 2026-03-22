# Personalize Export/Import Design

## Summary

Add Export and Import functionality to the Vibe Explorer Personalize tab. Export generates a zip file containing all saved custom prompts (metadata + preview images). Import accepts that same zip to replace the current personalized list.

## Decisions

- **Client-side only** — no new server endpoints. Uses existing fetch for images and existing save/reset APIs for import.
- **Zip format** — `prompts.json` manifest + image files, built with JSZip (already a project dependency).
- **Import replaces** — importing wipes existing prompts and replaces with zip contents.
- **No negative prompt** — not recorded in export; default is used on import.
- **Buttons near Reset All** — at the bottom of the Personalize tab.

## Zip Format

```
sogni-personalize-vibes.zip
├── prompts.json
├── watercolor-dream.jpg
├── retro-film.jpg
└── ...
```

### prompts.json

```json
{
  "version": 1,
  "modelType": "image-edit",
  "prompts": [
    {
      "name": "Watercolor Dream",
      "prompt": "a watercolor portrait with soft edges...",
      "imageFilename": "watercolor-dream.jpg"
    }
  ]
}
```

- `version` — integer, currently `1`. Future-proofs the format.
- `modelType` — `"sd"` or `"image-edit"`. Applied on import.
- `prompts[].imageFilename` — matches a file in the zip root. Optional (prompt still imports without an image).

## Export Flow

1. User clicks **Export** button.
2. Fetch all saved prompts from state (`personalizeSavedPrompts`).
3. For each prompt with an `imageFilename`, fetch the preview image via `getPreviewImageUrl()`.
4. Build zip: write `prompts.json` + image blobs.
5. Trigger browser download as `sogni-personalize-vibes.zip`.
6. Uses same JSZip pattern as `downloadImagesAsZip()` in `bulkDownload.js`.

## Import Flow

1. User clicks **Import** button → triggers hidden `<input type="file" accept=".zip">`.
2. Read selected file as ArrayBuffer, open with JSZip.
3. Parse `prompts.json` — validate `version` field exists and `prompts` is an array.
4. For each prompt, extract its image blob from the zip (if `imageFilename` present).
5. Convert image blobs to temporary object URLs or data URLs for the save API.
6. Reset existing prompts via `resetCustomPrompts()`.
7. Save imported prompts via `saveCustomPrompts()` with `previewImageUrl` fields so the backend fetches and stores the images.
8. Refresh UI state (re-fetch personalize data).

### Image Upload on Import

The existing save flow expects `previewImageUrl` on each prompt — the backend fetches that URL server-side and stores the image. For imported images (local blobs), we need the backend to accept them. Two options:

- **Option A**: Convert blob to data URL and send inline — the backend already fetches URLs, so data URLs may not work.
- **Option B**: Upload images to a temporary endpoint or use the existing image save mechanism differently.

Given the backend fetches `previewImageUrl` via HTTP, we'll convert imported images to **blob URLs** — but these are local and can't be fetched server-side. Instead, we'll need to either:
1. POST images as multipart form data to a small new endpoint, OR
2. Convert to base64 data URLs and have the backend handle those.

**Resolution**: Extend the existing `POST /api/personalize/:address` endpoint to accept base64 data URLs in `previewImageUrl` fields. The backend already processes these URLs — we just need it to detect `data:` prefix and decode instead of HTTP-fetching. This is a minimal server change.

## UI Design

At the bottom of the Personalize tab, alongside the existing "Reset All" button:

```
[Export] [Import] [Reset All]
```

- **Export** — disabled when no saved prompts exist.
- **Import** — always enabled (replaces everything).
- Both use the same button styling as "Reset All".

## Files Changed

| File | Change |
|------|--------|
| `src/utils/personalizeExport.ts` | **New** — `exportPersonalizeZip()` and `importPersonalizeZip()` functions |
| `src/components/shared/PhotoGallery.jsx` | Add Export/Import buttons + handlers in Personalize tab |
| `server/routes/personalize.js` | Handle `data:` URLs in `previewImageUrl` during save (for import) |

## Validation

- Export with 0 prompts: button disabled, no action.
- Import with malformed zip: show error toast, no state change.
- Import with missing `prompts.json`: show error toast.
- Import with missing image files: import prompts without images (graceful degradation).
- Import prompt count exceeds 999 limit: truncate to 999, warn user.
