/**
 * Pure function module for rewriting prompts with subject context
 * for context-image (edit) models.
 *
 * No side effects, no external service imports.
 */

export interface PromptRewriteOptions {
  subjectDescription: string; // e.g. "a young woman with long dark hair"
  faceCount: number;
  isEditPrompt: boolean; // true for image-edit-prompts category
}

/**
 * Rewrites a prompt with subject-specific context for edit/context-image models.
 *
 * For non-edit prompts: wraps with a transformation instruction prefix
 * containing the subject description. Inner prompt text is preserved unchanged.
 *
 * For edit prompts: replaces generic subject references ("the person", "their")
 * with the actual subject description. No wrapper prefix is added since these
 * prompts are already structured for edit models.
 *
 * Returns the original prompt unchanged when:
 * - prompt is empty/falsy
 * - subjectDescription is "the person" (analysis failed, no useful info)
 */
export function rewritePromptForEditModel(
  prompt: string,
  options: PromptRewriteOptions
): string {
  // Skip rewriting for empty/falsy prompts
  if (!prompt) return prompt;

  const { subjectDescription, isEditPrompt } = options;

  // Skip rewriting when analysis failed (no useful subject info)
  if (subjectDescription === 'the person') return prompt;

  if (isEditPrompt) {
    return rewriteEditPrompt(prompt, subjectDescription);
  } else {
    return rewriteNonEditPrompt(prompt, subjectDescription);
  }
}

/**
 * Rewrite a non-edit prompt (e.g. "Attractive, portrait in anime style").
 *
 * Wraps with a transformation prefix containing the subject description.
 * The inner prompt text is kept UNCHANGED to preserve reverse-lookup matching
 * (hashtag extraction, style display, sharing all compare stripped prompt text
 * against stylePrompts values).
 */
function rewriteNonEditPrompt(prompt: string, subjectDescription: string): string {
  return `Transform ${subjectDescription} in the photo while preserving their facial features and identity exactly into this style: ${prompt}`;
}

/**
 * Rewrite an edit prompt (e.g. "Make the person look like an astronaut").
 *
 * 1. Replace "the person" / "the person's" with the subject description / possessive
 * 2. Replace simple "their {noun}" patterns with the subject description's possessive form
 * 3. Do NOT add transformation prefix
 */
function rewriteEditPrompt(prompt: string, subjectDescription: string): string {
  let rewritten = prompt;

  // Step 1: Replace "the person's" (possessive) - must come before "the person"
  const possessiveDescription = makePossessive(subjectDescription);
  rewritten = rewritten.replace(/\bthe person's\b/gi, possessiveDescription);

  // Step 1b: Replace "the person" (non-possessive)
  rewritten = rewritten.replace(/\bthe person\b/gi, subjectDescription);

  // Step 2: Replace simple "their {noun}" patterns only
  // Only replace when followed by common body/attribute nouns to avoid breaking grammar
  const simpleTheirPattern = /\btheir\s+(face|hair|eyes|nose|mouth|skin|body|head|ears|teeth|lips|chin|forehead|cheeks|eyebrows|beard|mustache|clothes|clothing|outfit|expression|identity|features|appearance|look|style|likeness|characteristics)\b/gi;
  rewritten = rewritten.replace(simpleTheirPattern, (_match, noun) => {
    return `${possessiveDescription} ${noun}`;
  });

  return rewritten;
}

/**
 * Convert a subject description to its possessive form.
 * e.g. "a man with short gray hair" -> "a man with short gray hair's"
 *
 * Handles the edge case where the description ends with 's' (adds just apostrophe).
 */
function makePossessive(description: string): string {
  if (description.endsWith('s')) {
    return `${description}'`;
  }
  return `${description}'s`;
}
