import { Settings } from '../types/index';
import { getModelDefaults, isFluxKontextModel } from '../constants/settings';

export function getSettingFromCookie<T>(name: string, defaultValue: T): T {
  try {
    const value = localStorage.getItem(`sogni_${name}`);
    return value ? (JSON.parse(value) as T) : defaultValue;
  } catch (e) {
    console.warn(`Error reading cookie ${name}:`, e);
    return defaultValue;
  }
}

export function saveSettingsToCookies(settings: Partial<Settings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    try {
      localStorage.setItem(`sogni_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn(`Error saving setting ${key}:`, e);
    }
  });
}

// Model-specific settings management
const MODEL_SPECIFIC_SETTINGS = ['inferenceSteps', 'scheduler', 'timeStepSpacing', 'promptGuidance', 'guidance'];

export function getModelSpecificSetting<T>(modelId: string, settingName: string, defaultValue: T): T {
  try {
    const modelSettings = localStorage.getItem(`sogni_model_${modelId}`);
    if (modelSettings) {
      const parsed = JSON.parse(modelSettings);
      if (settingName in parsed) {
        return parsed[settingName] as T;
      }
    }
    return defaultValue;
  } catch (e) {
    console.warn(`Error reading model-specific setting ${settingName} for ${modelId}:`, e);
    return defaultValue;
  }
}

export function saveModelSpecificSettings(modelId: string, settings: Partial<Settings>): void {
  try {
    const existingSettings = localStorage.getItem(`sogni_model_${modelId}`);
    const modelSettings = existingSettings ? JSON.parse(existingSettings) : {};
    
    // Only save model-specific settings
    MODEL_SPECIFIC_SETTINGS.forEach(key => {
      if (key in settings) {
        modelSettings[key] = settings[key as keyof Settings];
      }
    });
    
    localStorage.setItem(`sogni_model_${modelId}`, JSON.stringify(modelSettings));
    console.log(`Saved model-specific settings for ${modelId}:`, modelSettings);
  } catch (e) {
    console.warn(`Error saving model-specific settings for ${modelId}:`, e);
  }
}

export function getSettingsForModel(modelId: string): Partial<Settings> {
  const modelDefaults = getModelDefaults(modelId);
  const isFluxKontext = isFluxKontextModel(modelId);
  
  return {
    inferenceSteps: getModelSpecificSetting(modelId, 'inferenceSteps', modelDefaults.inferenceSteps),
    scheduler: getModelSpecificSetting(modelId, 'scheduler', modelDefaults.scheduler),
    timeStepSpacing: getModelSpecificSetting(modelId, 'timeStepSpacing', modelDefaults.timeStepSpacing),
    promptGuidance: isFluxKontext 
      ? getSettingFromCookie('promptGuidance', 2) // Use global for non-Flux setting
      : getModelSpecificSetting(modelId, 'promptGuidance', modelDefaults.promptGuidance || 2),
    guidance: isFluxKontext 
      ? getModelSpecificSetting(modelId, 'guidance', modelDefaults.guidance)
      : getSettingFromCookie('guidance', 3), // Use global for non-Flux setting
    numImages: getModelSpecificSetting(modelId, 'numImages', modelDefaults.numImages),
  };
}

// Promotional popup utilities
export function shouldShowPromoPopup(): boolean {
  try {
    const lastShown = localStorage.getItem('sogni_promo_last_shown');
    if (!lastShown) {
      return true; // Never shown before
    }
    
    const lastShownDate = new Date(lastShown);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return lastShownDate < oneDayAgo;
  } catch (e) {
    console.warn('Error checking promo popup status:', e);
    return true; // Default to showing if there's an error
  }
}

export function markPromoPopupShown(): void {
  try {
    localStorage.setItem('sogni_promo_last_shown', new Date().toISOString());
  } catch (e) {
    console.warn('Error marking promo popup as shown:', e);
  }
}

// Theme group preferences utilities
export function getThemeGroupPreferences(): Record<string, boolean> {
  try {
    const preferences = localStorage.getItem('sogni_theme_groups');
    if (preferences) {
      return JSON.parse(preferences) as Record<string, boolean>;
    }
  } catch (e) {
    console.warn('Error reading theme group preferences:', e);
  }
  return {}; // Return empty object if not found or error
}

export function saveThemeGroupPreferences(preferences: Record<string, boolean>): void {
  try {
    localStorage.setItem('sogni_theme_groups', JSON.stringify(preferences));
  } catch (e) {
    console.warn('Error saving theme group preferences:', e);
  }
} 