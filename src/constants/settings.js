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

export const DEFAULT_SETTINGS = {
  selectedStyle: "photorealistic",
  selectedModel: "sdxl",
  numImages: 4,
  promptGuidance: 7.5,
  controlNetStrength: 0.8,
  controlNetGuidanceEnd: 1,
  flashEnabled: true,
  keepOriginalPhoto: true,
};

export const SOGNI_URLS = {
  api: import.meta.env.VITE_SOGNI_API_URL || "https://api.sogni.io",
  socket: import.meta.env.VITE_SOGNI_SOCKET_URL || "wss://api.sogni.io",
}; 