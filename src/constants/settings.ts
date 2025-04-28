export const modelOptions = [
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
];

// Helper function to safely get model options
export const getModelOptions = () => {
  // In case import fails or isn't available, return a fallback set
  if (!Array.isArray(modelOptions) || modelOptions.length === 0) {
    console.warn("Model options not loaded correctly, using fallbacks");
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
    ];
  }
  
  return modelOptions;
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

export const DEFAULT_SETTINGS = {
  selectedModel: "coreml-sogniXLturbo_alpha1_ad",
  numImages: 16,
  promptGuidance: 2,
  controlNetStrength: 0.8,
  controlNetGuidanceEnd: 0.6,
  flashEnabled: true,
  keepOriginalPhoto: false,
  selectedStyle: "randomMix",
};

export const SOGNI_URLS = {
  api: import.meta.env.VITE_SOGNI_API_URL || "https://api.sogni.io",
  socket: import.meta.env.VITE_SOGNI_SOCKET_URL || "wss://api.sogni.io",
};

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