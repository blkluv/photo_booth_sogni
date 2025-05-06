import { SogniClient } from '@sogni-ai/sogni-client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Helper function to generate a UUID
const generateUUID = () => uuidv4();

// Default credentials - these should match what was in the .env file example
const defaultCredentials = {
  SOGNI_APP_ID: 'photobooth-test-mark',
  SOGNI_USERNAME: 'TheArtist',
  SOGNI_PASSWORD: 'TAm1x*Gm6o!TLZ',
  RPC_ENDPOINT: 'https://base-sepolia.g.alchemy.com/v2/F9JKGLSddG0LmbSAx1Gq1JBrbtWvPpY9',
  SOGNI_ENV: 'production'
};

// Get Sogni URLs based on environment
const getSogniUrls = (env) => {
  const SOGNI_HOSTS = {
    'local': { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
    'staging': { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
    'production': { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' },
  };

  const sogniEnv = env || 'staging';
  
  if (!SOGNI_HOSTS[sogniEnv]) {
    throw new Error(`Invalid SOGNI_ENV: ${sogniEnv}. Must be one of: ${Object.keys(SOGNI_HOSTS).join(', ')}`);
  }
  
  return SOGNI_HOSTS[sogniEnv];
};

// Initialize the Sogni client
export async function initializeSogniClient() {
  const appId = `${process.env.SOGNI_APP_ID || defaultCredentials.SOGNI_APP_ID}-${generateUUID()}`;
  const sogniEnv = process.env.SOGNI_ENV || defaultCredentials.SOGNI_ENV;
  const username = process.env.SOGNI_USERNAME || defaultCredentials.SOGNI_USERNAME;
  const password = process.env.SOGNI_PASSWORD || defaultCredentials.SOGNI_PASSWORD;
  
  console.log(`Initializing Sogni client with app ID: ${appId} and environment: ${sogniEnv}`);
  const sogniUrls = getSogniUrls(sogniEnv);
  
  const client = await SogniClient.createInstance({
    appId,
    testnet: true, // Adjust based on environment if needed
    network: "fast",
    logLevel: "debug", // Use debug for more logs
    restEndpoint: sogniUrls.api,
    socketEndpoint: sogniUrls.socket,
  });

  try {
    console.log(`Logging in with username: ${username}`);
    await client.account.login(username, password);
    console.log('Login successful');
  } catch (error) {
    console.error('Login failed:', error);
    throw error; // Re-throw to be handled by the caller
  }
  return client;
}

// Get client info (for testing connection)
export async function getClientInfo() {
  const client = await initializeSogniClient();
  return {
    connected: true,
    appId: client.appId,
    network: client.network,
    authenticated: client.account.isLoggedIn // Access as property
  };
}

// Generate image using Sogni client - Refactored to match original event handling
export async function generateImage(params, progressCallback) {
  const client = await initializeSogniClient();
  
  // Determine if this is an enhancement request or generation request
  const isEnhancement = params.startingImage !== undefined;
  console.log(`Generating image with ${isEnhancement ? 'enhancement' : 'controlNet'} mode`);
  
  // Create project options based on request type
  const projectOptions = {
    modelId: params.selectedModel,
    positivePrompt: params.stylePrompt,
    sizePreset: 'custom',
    width: params.width,
    height: params.height,
    steps: isEnhancement ? 4 : 7,
    guidance: params.promptGuidance || (isEnhancement ? 1 : 7), // Default guidance depends on mode
    numberOfImages: params.numberImages || 1,
    scheduler: 'DPM Solver Multistep (DPM-Solver++)',
    timeStepSpacing: 'Karras'
  };

  if (isEnhancement) {
    projectOptions.startingImage = params.startingImage instanceof Uint8Array 
      ? params.startingImage 
      : new Uint8Array(params.startingImage);
    projectOptions.startingImageStrength = params.startingImageStrength || 0.85;
  } else if (params.imageData) { // Check for imageData for controlNet
    projectOptions.controlNet = {
      name: 'instantid',
      image: params.imageData instanceof Uint8Array 
        ? params.imageData 
        : new Uint8Array(params.imageData),
      strength: params.controlNetStrength || 0.8,
      mode: 'balanced',
      guidanceStart: 0,
      guidanceEnd: params.controlNetGuidanceEnd || 0.3,
    };
  } else {
    console.warn("No starting image or controlNet image data provided.");
  }

  console.log('Creating Sogni project with options:', JSON.stringify({
    ...projectOptions,
    startingImage: projectOptions.startingImage ? '[Binary data]' : undefined,
    controlNet: projectOptions.controlNet ? { ...projectOptions.controlNet, image: '[Binary data]' } : undefined
  }));

  try {
    const project = await client.projects.create(projectOptions);
    console.log('Project created:', project.id, 'Initial Jobs:', project.jobs.map(j => j.id));

    // Use a map to track jobs we've attached progress listeners to
    const handledJobProgress = new Set();

    // Function to setup progress listener for a job
    const setupProgressListener = (sdkJob) => {
      if (!sdkJob || handledJobProgress.has(sdkJob.id)) {
        return; // Already handled or invalid job
      }
      handledJobProgress.add(sdkJob.id);
      console.log(`Attaching progress listener to SDK Job ID: ${sdkJob.id}`);
      
      sdkJob.on('progress', (progressValue) => {
        if (progressCallback) {
          const normalizedProgress = typeof progressValue === 'number' && progressValue > 1 
                                     ? progressValue / 100 
                                     : (progressValue || 0);
          const progressEvent = {
            type: 'progress',
            jobId: sdkJob.id, // Use SDK job.id
            imgId: sdkJob.imgID,
            progress: normalizedProgress, // Send raw 0-1 value
            projectId: project.id,
            workerName: sdkJob.workerName || 'unknown'
          };
          console.log(`Forwarding job progress:`, JSON.stringify(progressEvent));
          progressCallback(progressEvent);
        }
      });
    };

    // Setup listeners for initial jobs
    if (project.jobs && project.jobs.length > 0) {
      project.jobs.forEach(setupProgressListener);
    }
    // Setup listeners for jobs added later
    project.on('updated', (keys) => {
      if (keys.includes('jobs')) {
        console.log('Project updated with new/updated jobs:', project.jobs.map(j => ({id: j.id, worker: j.workerName}) ));
        project.jobs.forEach(setupProgressListener);
      }
    });

    // --- Specific SDK Event Handlers --- 
    
    project.on('jobStarted', (sdkJob) => {
      console.log(`SDK: Job started - ID: ${sdkJob.id}, Worker: ${sdkJob.workerName || 'unknown'}`);
      setupProgressListener(sdkJob); // Ensure progress listener is attached
      if (progressCallback) {
        const startedEvent = {
          type: 'started',
          jobId: sdkJob.id, // Use SDK job.id
          imgId: sdkJob.imgID,
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        };
        console.log(`Forwarding job started:`, JSON.stringify(startedEvent));
        progressCallback(startedEvent);
        // Send initial 0% progress
        progressCallback({
          type: 'progress',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          progress: 0.0,
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });
    
    project.on('jobCompleted', (sdkJob) => {
      console.log(`SDK: Job completed - ID: ${sdkJob.id}, Worker: ${sdkJob.workerName || 'unknown'}, Result: ${sdkJob.resultUrl}`);
      if (progressCallback) {
        // Send final 100% progress
        progressCallback({
          type: 'progress',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          progress: 1.0, 
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
        // Send jobCompleted event
        progressCallback({
          type: 'jobCompleted',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          resultUrl: sdkJob.resultUrl, 
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });

    project.on('jobFailed', (sdkJob) => {
      console.error(`SDK: Job failed - ID: ${sdkJob.id}, Error: ${sdkJob.error}`);
      if (progressCallback) {
        progressCallback({
          type: 'jobFailed',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          error: sdkJob.error?.message || sdkJob.error || 'Unknown error',
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });
    
    // --- Project Completion/Failure --- 
    return new Promise((resolve, reject) => {
      project.on('completed', () => {
        console.log('Project completed with URLs:', project.resultUrls);
        resolve({
          projectId: project.id,
          result: { imageUrls: project.resultUrls } // Match structure expected by frontend
        });
        if (progressCallback) {
          progressCallback({
            type: 'complete',
            projectId: project.id,
            result: { imageUrls: project.resultUrls } 
          });
        }
      });

      project.on('failed', (error) => {
        console.error('Project failed:', error);
        reject(error);
        if (progressCallback) {
          progressCallback({
            type: 'error',
            projectId: project.id,
            error: error?.message || error || 'Unknown project error'
          });
        }
      });
    });

  } catch (error) {
    console.error('Error creating Sogni project:', error);
    throw error;
  }
} 