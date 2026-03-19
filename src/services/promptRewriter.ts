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
 * For non-edit prompts: strips the "Attractive" prefix, injects the subject
 * description, and wraps with a transformation instruction prefix.
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
 * 1. Strip leading "Attractive, " or "Attractive " prefix and replace with subject description
 * 2. Replace generic subject references ("a person", "the person", "someone", "a human")
 * 3. Wrap with transformation prefix
 */
function rewriteNonEditPrompt(prompt: string, subjectDescription: string): string {
  let rewritten = prompt;

  // Step 1: Strip "Attractive, " or "Attractive " prefix (case-insensitive)
  // and replace with the subject description
  const attractiveCommaMatch = rewritten.match(/^attractive,\s*/i);
  if (attractiveCommaMatch) {
    rewritten = subjectDescription + ', ' + rewritten.slice(attractiveCommaMatch[0].length);
  } else {
    const attractiveSpaceMatch = rewritten.match(/^attractive\s+/i);
    if (attractiveSpaceMatch) {
      rewritten = subjectDescription + ', ' + rewritten.slice(attractiveSpaceMatch[0].length);
    }
  }

  // Step 2: Replace generic subject references (case-insensitive, word boundaries)
  rewritten = replaceGenericSubjectReferences(rewritten, subjectDescription);

  // Step 3: Wrap with transformation prefix
  return `Transform ${subjectDescription} in the photo while preserving their facial features and identity exactly into this style: ${rewritten}`;
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
 * Replace generic subject references with the subject description.
 * Handles: "a person", "the person", "someone", "a human" (case-insensitive, word boundaries)
 */
function replaceGenericSubjectReferences(text: string, subjectDescription: string): string {
  const patterns = [
    /\ba person\b/gi,
    /\bthe person\b/gi,
    /\bsomeone\b/gi,
    /\ba human\b/gi,
  ];

  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, subjectDescription);
  }
  return result;
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
