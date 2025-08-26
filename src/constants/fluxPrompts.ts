// Flux.1 Kontext specific prompts
export const FLUX_KONTEXT_PROMPTS = {
  makeMeLegos: "Transform the subject into a lego character while keeping clothing, identity, stance, and expression as close as possible. The background should also be made of legos.",
  makeMePixelArt: "Transform the subject into pixel art style, maintaining their identity and pose but with chunky 8-bit pixelated appearance. Use vibrant retro gaming colors."
};

// Helper function to get Flux.1 Kontext prompts
export const getFluxKontextPrompts = () => {
  return FLUX_KONTEXT_PROMPTS;
};
