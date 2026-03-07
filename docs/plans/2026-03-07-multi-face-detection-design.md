# Multi-Face Detection via Sogni LLM Intelligence

## Overview

When a user captures or uploads a photo, run background LLM vision analysis during the ImageAdjuster step. If multiple main-subject faces are detected and the user is on a standard SDXL model (ControlNet/instantid), show a modal offering to switch to Qwen Image Edit Lightning (context image model that preserves all faces).

## Architecture

### Backend: `POST /api/sogni/analyze-faces`

New route using the global Sogni SDK client's `chat.completions.create()` with a multimodal vision message. Accepts base64 image data URI, returns `{ faceCount: number }`.

**LLM Prompt**: Instructs the model to count only main subjects intentionally posing, ignoring background bystanders, partially visible people at frame edges, and faces on screens/posters. Designed for conference/event settings where a photo booth kiosk may face an open area.

### Frontend: `src/services/faceAnalysisService.ts`

Calls the backend endpoint. Returns `{ faceCount: number }`. Handles timeout (5s) and errors gracefully (returns `{ faceCount: 1 }` on failure).

### Frontend: `src/components/shared/MultiFaceDetectedModal.tsx`

Modal component shown when `faceCount > 1` and current model is not a context image model. Offers to switch to Qwen Image Edit Lightning. User can accept or dismiss.

### Integration: ImageAdjuster

- On mount (when `imageUrl` changes), trigger background face analysis
- Cache result per imageUrl to avoid re-analysis
- On confirm: if faceCount > 1 and !isContextImageModel(selectedModel), show modal
- Modal "Yes" -> switchToModel('qwen_image_edit_2511_fp8_lightning') -> proceed with generation
- Modal "No" -> proceed with current model
- Skip analysis entirely if already on a context image model

### Key Behaviors

- **Non-blocking**: Analysis runs during crop; never blocks the user
- **Fail-safe**: Timeout/error silently proceeds without prompting
- **Smart prompt**: Distinguishes main subjects from bystanders in conference settings
- **Single analysis per photo**: Cached by imageUrl
