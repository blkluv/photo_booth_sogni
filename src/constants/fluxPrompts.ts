// Flux.1 Kontext specific prompts
export const FLUX_KONTEXT_PROMPTS = {
  makeMeLegos: "Preserve the person's face and identify, make them into a lego character while keeping the person's identity and facial characteristics identical",
  makeMeAstronautSuit: "Replace their clothes with a realistic NASA astronaut suit while keeping their face and identity the same",
  makeMeBodybuilder: "keep the person's face the same, keep hair the same, keep nose and mouth the same, same face shape, same expression, Make the person have huge muscles that blend naturally into their face realistically while keeping their existing identity and characteristics",
  makeMeClaymation: "Model the person in a claymation look, keep their identity, finger dents, matte clay and diorama set",
  makeMeCloned: "Make the person appear multiple times in the image while keeping everything else the same",
  makeMeBobblehead: "Convert the person into a bobblehead figure. (Keep the person's face, hair, and identity the same). Oversized head spring base simple studio background",
  makeMeCold: "cover the scene in snow and put winter clothes on the person, (keep the person's face and identity matching the original). They are very cold and you can see their breath",
  makeMeFortniteInspired: "Create a stylized battle royale portrait inspired by Fortnite keep identity saturated colors and action pose",
  makeMePixelArt: "make them into a retro pixel art character while keeping their identity",
  makeMePixarInspired: "Create a stylized portrait inspired by Pixar keep identity large expressive eyes soft global illumination warm backdrop",
  makeMeSimpsonsInspired: "Transform the person into The Simpsons character while preserving their identity and facial features",
  makeMeMarioKartInspired: "Place the person in a kart racing scene inspired by Super Mario Bros keeping their identity the same, bright track balloons and confetti",
  makeMeMinecraftInspired: "Voxelize the person and the scene into a Minecraft style keep identity squared features blocky environment and simple sky",
  makeMeWoWInspired: "Style the person as a fantasy World of Warcraft character while keeping their identity recognizable, ornate armor glowing runes and castle hall",
  makeMeZeldaInspired: "Style them into a heroic adventurer from Zelda while keeping their identity the same, cel shaded look forest temple background",
  makeMePopArt: "Create a pop art portrait keep identity halftone dots flat primaries and burst background",
  makeMeUkiyoE: "Render the person as an ukiyo e print keep identity bold linework flat color planes and wave or cloud motifs",
  makeMeTattooFlash: "Render the person as a traditional tattoo flash icon keep identity bold lines limited inks and parchment texture",
  makeThemAngry: "Make them angry",
  makeMeNeon: "keep their clothes the same, keep face the same, keep hair the same, keep nose and mouth the same, same face shape, same expression, aesthetic 9, reimagine this person while keeping their facial features intact, digital_drawing_(artwork), colorful, high_contrast, psychedelic illustration, surreal grotesque cartoon style, thick bold outlines, dripping and shiny, pink fleshy, exaggerated forms, neon palette (pink, green, yellow, purple), sticker-art aesthetic, vaporwave background with diagonal stripes, dynamic composition, urban street art vibe, inspired by graffiti and tattoo flash.",
  makeMeViking: "Change all the clothes to viking armor and viking hat with horns while keeping exact face and body size the same",
  makeMeBox: "Turn me into a boxer wearing blue boxing gloves and a sports top that says 'BASE', art style will be similar to Fortnite Characters, background looks like a boxing ring"
}

// Helper function to get Flux.1 Kontext prompts
export const getFluxKontextPrompts = () => {
  return FLUX_KONTEXT_PROMPTS;
};
