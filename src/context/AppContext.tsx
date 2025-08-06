import React, { createContext, useContext, useState, useRef } from 'react';
import { Photo, ProjectState, Settings } from '../types/index';
import { DEFAULT_SETTINGS } from '../constants/settings';
import { getSettingFromCookie, saveSettingsToCookies } from '../utils/cookies';

// Helper function to handle TezDev theme cookie migration
const getTezDevThemeFromCookie = () => {
  const savedTheme = getSettingFromCookie('tezdevTheme', DEFAULT_SETTINGS.tezdevTheme);
  // Force existing users with 'pink', 'blue', or 'gmvietnam' to default to 'off' since events are over
  if (savedTheme === 'pink' || savedTheme === 'blue' || savedTheme === 'gmvietnam') {
    // Save the new default and return it
    saveSettingsToCookies({ tezdevTheme: 'off' });
    return 'off';
  }
  return savedTheme;
};

interface LoadedImagesState {
  [key: string]: {
    ref?: boolean;
    gen?: boolean;
  };
}

interface AppContextType {
  // Photos
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  selectedPhotoIndex: number | null;
  setSelectedPhotoIndex: React.Dispatch<React.SetStateAction<number | null>>;
  
  // Image Loading State
  loadedImages: LoadedImagesState;
  setLoadedImages: React.Dispatch<React.SetStateAction<LoadedImagesState>>;
  
  // Settings
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  
  // Style Dropdown
  showStyleDropdown: boolean;
  setShowStyleDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Project State
  projectState: ProjectState;
  
  // UI State
  showInfoModal: boolean;
  setShowInfoModal: React.Dispatch<React.SetStateAction<boolean>>;
  showPhotoGrid: boolean;
  setShowPhotoGrid: React.Dispatch<React.SetStateAction<boolean>>;
  dragActive: boolean;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Photos state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  
  // Image loading state
  const [loadedImages, setLoadedImages] = useState<LoadedImagesState>({});
  
  // Style dropdown state
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState<Settings>(() => ({
    selectedStyle: getSettingFromCookie('selectedStyle', DEFAULT_SETTINGS.selectedStyle),
    selectedModel: getSettingFromCookie('selectedModel', DEFAULT_SETTINGS.selectedModel),
    numImages: getSettingFromCookie('numImages', DEFAULT_SETTINGS.numImages),
    promptGuidance: getSettingFromCookie('promptGuidance', DEFAULT_SETTINGS.promptGuidance),
    controlNetStrength: getSettingFromCookie('controlNetStrength', DEFAULT_SETTINGS.controlNetStrength),
    controlNetGuidanceEnd: getSettingFromCookie('controlNetGuidanceEnd', DEFAULT_SETTINGS.controlNetGuidanceEnd),
    flashEnabled: getSettingFromCookie('flashEnabled', DEFAULT_SETTINGS.flashEnabled),
    keepOriginalPhoto: getSettingFromCookie('keepOriginalPhoto', DEFAULT_SETTINGS.keepOriginalPhoto),
    positivePrompt: getSettingFromCookie('positivePrompt', DEFAULT_SETTINGS.positivePrompt),
    stylePrompt: getSettingFromCookie('stylePrompt', DEFAULT_SETTINGS.stylePrompt),
    negativePrompt: getSettingFromCookie('negativePrompt', DEFAULT_SETTINGS.negativePrompt),
    seed: getSettingFromCookie('seed', DEFAULT_SETTINGS.seed),
    soundEnabled: getSettingFromCookie('soundEnabled', DEFAULT_SETTINGS.soundEnabled || true),
    slothicornAnimationEnabled: getSettingFromCookie('slothicornAnimationEnabled', DEFAULT_SETTINGS.slothicornAnimationEnabled || true),
    aspectRatio: getSettingFromCookie('aspectRatio', DEFAULT_SETTINGS.aspectRatio),
    tezdevTheme: getTezDevThemeFromCookie()
  }));
  
  // Project state
  const projectState = useRef<ProjectState>({
    currentPhotoIndex: 0,
    jobs: new Map(),
    startedJobs: new Set(),
    completedJobs: new Map(),
    pendingCompletions: new Map(),
  }).current;
  
  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      saveSettingsToCookies({ [key]: value });
      return newSettings;
    });
  };
  
  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettingsToCookies(DEFAULT_SETTINGS);
  };
  
  return (
    <AppContext.Provider
      value={{
        photos,
        setPhotos,
        selectedPhotoIndex,
        setSelectedPhotoIndex,
        loadedImages,
        setLoadedImages,
        settings,
        updateSetting,
        resetSettings,
        showStyleDropdown,
        setShowStyleDropdown,
        projectState,
        showInfoModal,
        setShowInfoModal,
        showPhotoGrid,
        setShowPhotoGrid,
        dragActive,
        setDragActive,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}; 