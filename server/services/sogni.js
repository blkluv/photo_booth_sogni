import { SogniClient } from '@sogni-ai/sogni-client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Helper function to generate a UUID
const generateUUID = () => uuidv4();

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

// Cache tokens for login efficiency
let sogniTokens = null; // { token, refreshToken }
let sogniUsername = null;
let sogniAppId = null;
let sogniEnv = null;
let sogniUrls = null;

// Helper to create a new SogniClient for each project
async function createSogniClient() {
  sogniAppId = `${process.env.SOGNI_APP_ID}-${generateUUID()}`;
  sogniEnv = process.env.SOGNI_ENV || 'production';
  sogniUsername = process.env.SOGNI_USERNAME;
  const password = process.env.SOGNI_PASSWORD;
  sogniUrls = getSogniUrls(sogniEnv);

  const client = await SogniClient.createInstance({
    appId: sogniAppId,
    testnet: true,
    network: "fast",
    logLevel: "debug",
    restEndpoint: sogniUrls.api,
    socketEndpoint: sogniUrls.socket,
  });

  // Try to restore session with tokens if available
  try {
    if (sogniTokens && sogniTokens.token && sogniTokens.refreshToken) {
      await client.account.setToken(sogniUsername, sogniTokens);
      if (!client.account.isLoggedIn) {
        await client.account.login(sogniUsername, password);
      }
    } else {
      await client.account.login(sogniUsername, password);
    }
  } catch (e) {
    await client.account.login(sogniUsername, password);
  }
  // Save tokens for reuse
  if (client.account.currentAccount && client.account.currentAccount.token && client.account.currentAccount.refreshToken) {
    sogniTokens = {
      token: client.account.currentAccount.token,
      refreshToken: client.account.currentAccount.refreshToken,
    };
  }
  return client;
}

export async function getClientInfo() {
  const client = await createSogniClient();
  const info = {
    connected: true,
    appId: client.appId,
    network: client.network,
    authenticated: client.account.isLoggedIn
  };
  // Clean up after info check
  if (client.disconnect) {
    try { await client.disconnect(); } catch {}
  }
  return info;
}

export async function generateImage(params, progressCallback) {
  const client = await createSogniClient();
  try {
    const isEnhancement = params.startingImage !== undefined;
    const projectOptions = {
      modelId: params.selectedModel,
      positivePrompt: params.stylePrompt,
      sizePreset: 'custom',
      width: params.width,
      height: params.height,
      steps: isEnhancement ? 4 : 7,
      guidance: params.promptGuidance || (isEnhancement ? 1 : 7),
      numberOfImages: params.numberImages || 1,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras'
    };
    if (isEnhancement) {
      projectOptions.startingImage = params.startingImage instanceof Uint8Array 
        ? params.startingImage 
        : new Uint8Array(params.startingImage);
      projectOptions.startingImageStrength = params.startingImageStrength || 0.85;
    } else if (params.imageData) {
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
    const project = await client.projects.create(projectOptions);
    const handledJobProgress = new Set();
    const setupProgressListener = (sdkJob) => {
      if (!sdkJob || handledJobProgress.has(sdkJob.id)) return;
      handledJobProgress.add(sdkJob.id);
      sdkJob.on('progress', (progressValue) => {
        if (progressCallback) {
          const normalizedProgress = typeof progressValue === 'number' && progressValue > 1 
                                     ? progressValue / 100 
                                     : (progressValue || 0);
          const progressEvent = {
            type: 'progress',
            jobId: sdkJob.id,
            imgId: sdkJob.imgID,
            progress: normalizedProgress,
            projectId: project.id,
            workerName: sdkJob.workerName || 'unknown'
          };
          progressCallback(progressEvent);
        }
      });
    };
    if (project.jobs && project.jobs.length > 0) {
      project.jobs.forEach(setupProgressListener);
    }
    project.on('updated', (keys) => {
      if (keys.includes('jobs')) {
        project.jobs.forEach(setupProgressListener);
      }
    });
    project.on('jobStarted', (sdkJob) => {
      setupProgressListener(sdkJob);
      if (progressCallback) {
        const startedEvent = {
          type: 'started',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        };
        progressCallback(startedEvent);
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
      if (progressCallback) {
        progressCallback({
          type: 'progress',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          progress: 1.0, 
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
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
    return await new Promise((resolve, reject) => {
      project.on('completed', () => {
        resolve({
          projectId: project.id,
          result: { imageUrls: project.resultUrls }
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
  } finally {
    // Always disconnect this client after use
    if (client.disconnect) {
      try { await client.disconnect(); } catch {}
    }
  }
}

// Global error handler for unhandled WebSocket errors
process.on('uncaughtException', (err) => {
  if (
    err &&
    typeof err.message === 'string' &&
    err.message.includes('WebSocket was closed before the connection was established')
  ) {
    console.warn('Ignored WebSocket connection race error:', err.message);
    return;
  }
  throw err;
});

process.on('unhandledRejection', (reason) => {
  if (
    reason &&
    typeof reason.message === 'string' &&
    reason.message.includes('WebSocket was closed before the connection was established')
  ) {
    console.warn('Ignored WebSocket connection race error (promise):', reason.message);
    return;
  }
  throw reason;
});

// Replace initializeSogniClient with getSogniClient
export async function initializeSogniClient() {
  return createSogniClient();
}

// Add cleanupSogniClient function
export async function cleanupSogniClient({ logout = false } = {}) {
  // This is a no-op now since we're using per-request clients that 
  // automatically disconnect after each use, but we keep the function 
  // for compatibility with existing code that imports it
  console.log('cleanupSogniClient called - connections now managed per-request');
  return true;
} 