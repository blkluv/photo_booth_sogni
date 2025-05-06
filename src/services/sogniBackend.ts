/**
 * Sogni Backend Service
 * 
 * This service handles all communication with the Sogni API through our backend
 * instead of directly using the Sogni SDK in the frontend.
 */

import { generateImage as apiGenerateImage, createProject as apiCreateProject, checkSogniStatus, cancelProject } from './api';
import { getCustomDimensions } from '../utils/imageProcessing';
import { getRandomStyle, getRandomMixPrompts } from './prompts';

// Shared interface for events
interface SogniEventEmitter {
  on: (event: string, callback: Function) => void;
  off: (event: string, callback: Function) => void;
  emit: (event: string, ...args: any[]) => void;
}

/**
 * Create a simple event emitter to simulate the Sogni client events
 */
function createEventEmitter(): SogniEventEmitter {
  const listeners: Record<string, Function[]> = {};
  
  return {
    on(event: string, callback: Function) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    },
    
    off(event: string, callback: Function) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      }
    },
    
    emit(event: string, ...args: any[]) {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(...args));
      }
    }
  };
}

/**
 * Mock Project object that simulates the Sogni SDK Project interface
 */
export class BackendProject implements SogniEventEmitter {
  private eventEmitter: SogniEventEmitter;
  public id: string;
  public jobs: { 
    id: string; 
    on: Function; 
    resultUrl?: string; 
    workerName?: string; 
    realJobId?: string;
    index?: number;
  }[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.eventEmitter = createEventEmitter();
  }
  
  // Event methods
  on(event: string, callback: Function) {
    this.eventEmitter.on(event, callback);
    return this;
  }
  
  off(event: string, callback: Function) {
    this.eventEmitter.off(event, callback);
    return this;
  }
  
  emit(event: string, ...args: any[]) {
    this.eventEmitter.emit(event, ...args);
    return this;
  }
  
  // Add a job to the project
  addJob(jobId: string, resultUrl?: string, index?: number, workerName?: string) {
    console.log(`Adding job ${jobId} with workerName "${workerName || 'unknown'}"`);
    const job = {
      id: jobId,
      resultUrl,
      workerName: workerName || '', // Don't use hardcoded default
      index,
      realJobId: undefined, // Will be set later when we receive the real job ID
      on: (event: string, callback: Function) => {
        // Simple event handler for the job
        if (event === 'progress') {
          // Store the callback to call later
          (job as any).progressCallback = callback;
        }
      }
    };
    
    this.jobs.push(job);
    return job;
  }
  
  // Update job progress
  updateJobProgress(jobId: string, progress: number | null | undefined, workerName?: string) {
    console.log(`BackendProject: Updating job ${jobId} progress to ${progress}`);
    const job = this.jobs.find(j => j.id === jobId);
    
    // Update worker name if provided and job exists - simple direct assignment
    if (workerName && job) {
      // Only update if we don't already have a worker name or if it's different
      if (!job.workerName || job.workerName !== workerName) {
        console.log(`Updating worker name for job ${job.id} from "${job.workerName}" to "${workerName}"`);
        job.workerName = workerName;
      }
    }

    // Skip further processing for null/undefined progress
    if (progress === null || progress === undefined) {
      console.log(`Skipping null/undefined progress update for job ${jobId}`);
      return;
    }

    // Ensure we have a normalized progress value (0-1)
    const normalizedProgress = typeof progress === 'number' && progress > 1 ? progress / 100 : progress;
    
    if (job && (job as any).progressCallback) {
      console.log(`BackendProject: Calling progress callback for job ${jobId} with normalized progress ${normalizedProgress}`);
      
      // Always pass the normalized value (0-1 range) to match the SDK
      (job as any).progressCallback(normalizedProgress);
    } else {
      console.log(`BackendProject: No progress callback found for job ${jobId}`);
    }
    
    // Also emit at the project level
    const eventData = { 
      type: 'progress', 
      jobId, 
      progress: normalizedProgress, // Pass normalized value (0-1 range)
      projectId: this.id,
      workerName: job ? job.workerName : workerName  // Use job's worker name or provided name
    };
    console.log(`BackendProject: Emitting job event with worker name "${eventData.workerName}":`, JSON.stringify(eventData));
    this.emit('job', eventData);
  }
  
  // Complete a job
  completeJob(jobId: string, resultUrl: string) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.resultUrl = resultUrl;
      this.emit('jobCompleted', job);
    }
  }
  
  // Fail a job
  failJob(jobId: string, error: string) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      (job as any).error = error;
      this.emit('jobFailed', { ...job, error });
    }
  }
}

/**
 * Mock Sogni client that calls our backend API
 */
export class BackendSogniClient {
  private isLoggedIn = false;
  public appId: string;
  public network: string;
  public account: any; // Use any type to allow flexibility
  public projects: {
    create: (params: any) => Promise<BackendProject>;
    on: (event: string, callback: Function) => void;
  };
  private activeProjects: Map<string, BackendProject> = new Map();
  
  constructor(appId: string) {
    this.appId = appId;
    this.network = 'fast';
    
    // Mock account methods
    this.account = {
      // Instead of a method, make it a value getter for compatibility
      get isLoggedIn() { 
        return this.isLoggedInValue; 
      },
      isLoggedInValue: false,
      login: async () => {
        this.account.isLoggedInValue = true;
        return true;
      }
    };
    
    // Mock projects methods
    this.projects = {
      create: this.createProject.bind(this),
      on: (event: string, callback: Function) => {
        // This would handle global project events if needed
      }
    };
  }
  
  /**
   * Cancel a running project
   * This will emit a 'cancelled' event to the project
   */
  async cancelProject(projectId: string): Promise<void> {
    console.log(`Cancelling project: ${projectId}`);
    const project = this.activeProjects.get(projectId);
    
    if (project) {
      try {
        // Call the backend cancellation API
        await cancelProject(projectId);
        
        // Emit cancelled event
        project.emit('cancelled');
        // Emit failed event to ensure client handles cleanup
        project.emit('failed', new Error('Project cancelled by user'));
        
        // Fail all jobs that haven't completed
        project.jobs.forEach(job => {
          if (!job.resultUrl) {
            project.failJob(job.id, 'Project cancelled by user');
          }
        });
        
        // Remove from active projects
        this.activeProjects.delete(projectId);
      } catch (error: any) {
        console.error(`Error cancelling project ${projectId}:`, error);
        // Still attempt cleanup even if the API call fails
        project.emit('failed', new Error(`Project cancellation failed: ${error?.message || String(error)}`));
        this.activeProjects.delete(projectId);
      }
    }
  }
  
  /**
   * Create a new project using the backend API
   */
  private async createProject(params: any): Promise<BackendProject> {
    // Create a new project object to return to the caller
    const projectId = `backend-project-${Date.now()}`;
    const project = new BackendProject(projectId);
    
    // Keep track of this project
    this.activeProjects.set(projectId, project);
    
    // Create placeholder jobs initially - but these will be replaced by real job IDs from the server
    // This matches the SDK behavior where jobs are created dynamically as they are initialized
    const placeholderJobs = new Map<number, string>();
    for (let i = 0; i < params.numberOfImages; i++) {
      // Create a temporary placeholder - these will be updated with real jobIds 
      // when we receive 'initiating' or 'started' events from the server
      const placeholderId = `placeholder-${projectId}-${i}`;
      placeholderJobs.set(i, placeholderId);
      project.addJob(placeholderId, undefined, i); // Store the index for mapping
    }
    
    // Start the backend generation process
    try {
      apiCreateProject(params, (progressEvent) => {
        // Handle different event types from the server
        console.log('ApiCreateProject progress callback received:', JSON.stringify(progressEvent));
        
        // Handle numeric progress (simple case) - distribute to all jobs
        if (typeof progressEvent === 'number') {
          project.jobs.forEach((job, idx) => {
            project.updateJobProgress(job.id, progressEvent);
          });
        } 
        // Handle structured events (most cases)
        else if (progressEvent && typeof progressEvent === 'object') {
          const eventType = progressEvent.type;
          const jobId = progressEvent.jobId; // This should be the SDK job.id (imgID)
          
          // Extract worker name from any event if available
          const workerName = progressEvent.workerName || 
                             (progressEvent.progress && progressEvent.progress.workerName);
          
          console.log(`Event ${eventType} with jobId: ${jobId}, worker name: ${workerName || 'unknown'}`);
          
          // Find the corresponding frontend job placeholder using the received jobId (SDK job.id/imgID)
          const jobIndex = project.jobs.findIndex(j => 
              j.realJobId === jobId || 
              (!j.realJobId && !project.jobs.some(otherJob => otherJob.realJobId === jobId))
          );
          
          let targetJob = jobIndex >= 0 ? project.jobs[jobIndex] : null;

          // If found, update its details
          if (targetJob) {
            // Assign real job ID if this is the first time we see it for this placeholder
            if (jobId && !targetJob.realJobId) {
              targetJob.realJobId = jobId;
              console.log(`JOB ID MAPPING: Placeholder ${targetJob.id} assigned realJobId ${jobId}`);
            }
            // Update worker name if provided
            if (workerName) {
              targetJob.workerName = workerName;
            }
          } else {
            console.warn(`Could not find placeholder job for event with jobId: ${jobId}. Event type: ${eventType}`);
          }
          
          // Process based on event type
          switch (eventType) {
            case 'initiating':
            case 'started':
              if (targetJob) {
                project.emit('job', { 
                  type: eventType, 
                  jobId: targetJob.id, // Emit with placeholder ID
                  realJobId: jobId, // Include real ID
                  projectId: project.id,
                  workerName: targetJob.workerName
                });
              }
              break;

            case 'progress':
              if (targetJob && progressEvent.progress !== undefined) {
                project.updateJobProgress(targetJob.id, progressEvent.progress, targetJob.workerName);
              }
              break;
              
            case 'jobCompleted':
              if (targetJob && progressEvent.resultUrl) {
                console.log(`Processing jobCompleted for placeholder ${targetJob.id} (real ID ${jobId})`);
                project.completeJob(targetJob.id, progressEvent.resultUrl);
              } else {
                console.warn(`jobCompleted event received for ${jobId}, but couldn't find target job or resultUrl.`);
              }
              break;
              
            case 'jobFailed':
              if (targetJob) {
                const error = progressEvent.error || 'Generation failed';
                console.log(`Processing jobFailed for placeholder ${targetJob.id} (real ID ${jobId}) with error: ${error}`);
                project.failJob(targetJob.id, error);
              } else {
                console.warn(`jobFailed event received for ${jobId}, but couldn't find target job.`);
              }
              break;
              
            case 'failed': // Project level failure
              project.emit('failed', new Error(progressEvent.error || 'Project failed'));
              break;
              
            // Ignore project-progress and connected types here, handled elsewhere or implicitly
            case 'project-progress': 
            case 'connected':
              break;
              
            default:
              console.warn(`Unhandled event type in apiCreateProject callback: ${eventType}`);
          }
        }
      }).then((result) => {
        // Handle overall project completion
        if (result && result.imageUrls) {
          project.emit('completed', result.imageUrls);
        }
      }).catch((error) => {
        console.error('Backend generation process failed:', error);
        project.emit('failed', error);
      });
    } catch (error) {
      console.error('Error starting generation:', error);
      project.emit('failed', error);
      // Remove from active projects
      this.activeProjects.delete(projectId);
    }
    
    return project;
  }
  
  /**
   * Factory method to create a client instance
   */
  static async createInstance(config: any): Promise<BackendSogniClient> {
    const client = new BackendSogniClient(config.appId);
    return client;
  }
}

/**
 * Initialize the Sogni client through the backend
 */
export async function initializeSogniClient(): Promise<BackendSogniClient> {
  try {
    // Check if the backend is available
    const status = await checkSogniStatus().catch(error => {
      console.error('Backend status check failed:', error);
      
      // Handle credential errors
      if (error.message && error.message.includes('401')) {
        // Show a more user-friendly error message
        const message = 'The Sogni API credentials are invalid. This is a server configuration issue and needs to be fixed by updating the server/.env file.';
        console.error(message);
      }
      
      throw error;
    });
    
    // Create a new client instance
    const client = await BackendSogniClient.createInstance({
      appId: `photobooth-frontend-${Date.now()}`,
      testnet: true,
      network: "fast",
      logLevel: "debug"
    });
    
    // Mock login
    await client.account.login();
    
    return client;
  } catch (error) {
    console.error('Error initializing Sogni client:', error);
    throw error;
  }
}

/**
 * Generate image using the backend
 */
export async function generateImage(params: any): Promise<string[]> {
  const client = await initializeSogniClient();
  
  // Implementation will be moved from App.jsx
  // This is just the interface for now
  return [];
}