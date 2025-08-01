import { Settings, AspectRatioOption } from '../types/index';

// Helper function to safely get model options
export const getModelOptions = () => {
  return [
    {
      label: "🅂 Sogni.XLT 𝛂1 (SDXL Turbo)",
      value: "coreml-sogniXLturbo_alpha1_ad",
    },
    {
      label: "DreamShaper v2.1 (SDXL Turbo)",
      value: "coreml-dreamshaperXL_v21TurboDPMSDE",
    },
    {
      label: "JuggernautXL 9 + RD Photo2 (SDXL Lightning)",
      value: "coreml-juggernautXL_v9Rdphoto2Lightning",
    },
    {
      label: "wildcardx XL (SDXL Lightning)",
      value: "coreml-wildcardxXLLIGHTNING_wildcardxXL",
    },
    {
      label: "RealVisXL v4 (SDXL Lightning)",
      value: "coreml-realvisxlV40_v40LightningBakedvae",
    },
    {
      label: "RealDream (SDXL Lightning)",
      value: "coreml-realDream_sdxlLightning1",
    },
    {
      label: "FenrisXL (SDXL Lightning)",
      value: "coreml-fenrisxl_SDXLLightning",
    },
    {
      label: "epiCRealism XL VXI (SDXL Lightning)",
      value: "coreml-epicrealismXL_VXIAbeast4SLightning",
    },
  ];
};

// Helper function to get a valid model option value
export const getValidModelValue = (selectedValue: string) => {
  const options = getModelOptions();
  const defaultValue = options[0].value;
  
  // If the selected value exists in options, use it
  if (selectedValue && options.some(option => option.value === selectedValue)) {
    return selectedValue;
  }
  
  // Otherwise use the first option as default
  return defaultValue;
};

// Helper function to determine default aspect ratio - defaults to narrow (2:3) for new users
export const getDefaultAspectRatio = (): AspectRatioOption => {
  // Check if user has an existing aspect ratio preference in cookies
  const savedAspectRatio = document.cookie
    .split('; ')
    .find(row => row.startsWith('aspectRatio='))
    ?.split('=')[1];
    
  // If user has a saved preference, respect it
  if (savedAspectRatio && ['ultranarrow', 'narrow', 'portrait', 'square', 'landscape', 'wide', 'ultrawide'].includes(savedAspectRatio)) {
    return savedAspectRatio as AspectRatioOption;
  }
  
  // For new users, default to portrait (3:4) 
  return 'portrait';
};

export const DEFAULT_SETTINGS: Settings = {
  selectedModel: "coreml-sogniXLturbo_alpha1_ad",
  numImages: 8,
  promptGuidance: 2,
  controlNetStrength: 0.7,
  controlNetGuidanceEnd: 0.6,
  flashEnabled: true,
  keepOriginalPhoto: false,
  selectedStyle: "randomMix",
  positivePrompt: '',
  stylePrompt: '',
  negativePrompt: '',
  seed: '',
  soundEnabled: true,
  slothicornAnimationEnabled: true,
  aspectRatio: getDefaultAspectRatio(),
  tezdevTheme: 'gmvietnam' as const,
};

// Backend now handles all Sogni API communication, so we don't need these URLs in the frontend
export const SOGNI_URLS = {
  api: "/api/sogni",  // Local API endpoint that proxies to Sogni
  socket: "", // We don't use WebSockets directly anymore
};

// Timeout configurations
export const TIMEOUT_CONFIG = {
  // Per-job timeout - how long to wait for a single job to complete after it starts progressing
  PER_JOB_TIMEOUT: 4 * 60 * 1000, // 4 minutes
  
  // Project watchdog timeout - how long to wait for progress on ANY job before considering project stuck  
  PROJECT_WATCHDOG_TIMEOUT: 2 * 60 * 1000, // 2 minutes
  
  // Initial connection timeout - how long to wait for first event from backend
  INITIAL_CONNECTION_TIMEOUT: 30 * 1000, // 30 seconds
  
  // Overall project timeout - maximum time for entire batch (matches backend)
  OVERALL_PROJECT_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  
  // Progress stall timeout - how long without progress updates before considering a job stuck
  PROGRESS_STALL_TIMEOUT: 90 * 1000, // 90 seconds
} as const;

export const defaultStylePrompts: { [key: string]: string } = {
  custom: "",
  photorealistic: "photorealistic, highly detailed, 8k uhd, high quality",
  anime: "anime style, manga style, japanese animation",
  watercolor: "watercolor painting, artistic, soft colors",
  oilPainting: "oil painting, textured, artistic, masterpiece",
  pencilSketch: "pencil sketch, black and white, detailed drawing",
  popArt: "pop art style, bold colors, comic book style",
  cyberpunk: "cyberpunk style, neon colors, futuristic",
  steampunk: "steampunk style, victorian, brass and copper",
  fantasy: "fantasy art style, magical, ethereal",
  random: "{photorealistic|anime|watercolor|oilPainting|pencilSketch|popArt|cyberpunk|steampunk|fantasy}",
}; 