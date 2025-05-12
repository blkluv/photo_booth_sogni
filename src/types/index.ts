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
} 