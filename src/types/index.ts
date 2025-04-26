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
}

export interface ProjectState {
  currentPhotoIndex: number;
  jobs: Map<string, JobState>;
  startedJobs: Set<string>;
  completedJobs: Map<string, any>;
  pendingCompletions: Map<string, any>;
}

export interface JobState {
  index: number;
  status: string;
  resultUrl?: string;
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
} 