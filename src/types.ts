// Add slothicornAnimationEnabled to the Settings interface
export interface Settings {
  selectedStyle: string;
  selectedModel: string;
  numImages: number;
  promptGuidance: number;
  controlNetStrength: number;
  controlNetGuidanceEnd: number;
  flashEnabled: boolean;
  keepOriginalPhoto: boolean;
  positivePrompt: string;
  stylePrompt: string;
  negativePrompt: string;
  seed: string;
  soundEnabled: boolean;
  slothicornAnimationEnabled: boolean;
} 