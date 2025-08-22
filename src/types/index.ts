export interface Photo {
  id: string;
  generating: boolean;
  images: string[];
  error?: string;
  originalDataUrl?: string;
  newlyArrived?: boolean;
  generationCountdown?: number;
  isOriginal?: boolean;
  loading?: boolean;
  progress?: number;
  permanentError?: boolean;

  // Timeout tracking fields
  jobStartTime?: number;
  lastProgressTime?: number;
  timedOut?: boolean;
}

export interface ProjectState {
  currentPhotoIndex: number;
  jobs: Map<string, JobState>;
  startedJobs: Set<string>;
  completedJobs: Map<string, unknown>;
  pendingCompletions: Map<string, unknown>;
}

export interface JobState {
  index: number;
  status: string;
  resultUrl?: string;
  progress?: number;
  error?: string;
}

export interface StylePrompt {
  [key: string]: string;
}

export interface ModelOption {
  label: string;
  value: string;
}

export type AspectRatioOption = 'portrait' | 'landscape' | 'square' | 'narrow' | 'wide' | 'ultrawide' | 'ultranarrow';

export type TezDevTheme = 'blue' | 'pink' | 'gmvietnam' | 'supercasual' | 'off';

export interface Settings {
  selectedStyle: string;
  selectedModel: string;
  numImages: number;
  promptGuidance: number;
  controlNetStrength: number;
  controlNetGuidanceEnd: number;
  flashEnabled: boolean;
  keepOriginalPhoto: boolean;
  positivePrompt?: string;
  stylePrompt?: string;
  negativePrompt?: string;
  seed?: string;
  soundEnabled: boolean;
  slothicornAnimationEnabled: boolean;
  backgroundAnimationsEnabled: boolean;
  aspectRatio: AspectRatioOption;
  tezdevTheme: TezDevTheme;
} 