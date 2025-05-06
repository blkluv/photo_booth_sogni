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
  // Use environment variables or fall back to defaults
  const appId = `${process.env.SOGNI_APP_ID || defaultCredentials.SOGNI_APP_ID}-${generateUUID()}`;
  const sogniEnv = process.env.SOGNI_ENV || defaultCredentials.SOGNI_ENV;
  const username = process.env.SOGNI_USERNAME || defaultCredentials.SOGNI_USERNAME;
  const password = process.env.SOGNI_PASSWORD || defaultCredentials.SOGNI_PASSWORD;
  
  // Enhanced debugging
  console.log(`DEBUG - Environment variables loaded`);
  console.log(`DEBUG - SOGNI_APP_ID: ${process.env.SOGNI_APP_ID || "(using default)"}`);
  console.log(`DEBUG - SOGNI_USERNAME: ${process.env.SOGNI_USERNAME || "(using default)"}`);
  console.log(`DEBUG - SOGNI_PASSWORD: ${process.env.SOGNI_PASSWORD ? "(password provided)" : "(using default password)"}`);
  console.log(`DEBUG - SOGNI_ENV: ${process.env.SOGNI_ENV || "(using default)"}`);
  console.log(`DEBUG - .env file path: ${process.cwd()}/.env`);
  
  // Debug actual .env file content (except password)
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : 'File not found';
    console.log(`DEBUG - .env file content:\n${envContent.replace(/PASSWORD=.*$/m, 'PASSWORD=[redacted]')}`);
  } catch (err) {
    console.log(`DEBUG - Error reading .env file: ${err.message}`);
  }
  
  console.log(`Initializing Sogni client with app ID: ${appId} and environment: ${sogniEnv}`);
  
  const sogniUrls = getSogniUrls(sogniEnv);
  console.log(`DEBUG - Using Sogni URLs: API=${sogniUrls.api}, Socket=${sogniUrls.socket}`);
  
  try {
    console.log(`DEBUG - Creating SogniClient instance...`);
    const client = await SogniClient.createInstance({
      appId,
      testnet: true,
      network: "fast",
      logLevel: "debug",
      restEndpoint: sogniUrls.api,
      socketEndpoint: sogniUrls.socket,
    });
    
    console.log(`DEBUG - SogniClient instance created successfully`);

    try {
      console.log(`DEBUG - Attempting login with username: ${username}`);
      await client.account.login(username, password);
      console.log('DEBUG - Login successful!');
    } catch (error) {
      console.error('DEBUG - Login failed:', error);
      console.error(`DEBUG - Error status: ${error.status}`);
      console.error(`DEBUG - Error payload:`, error.payload);
      console.error(`DEBUG - Stack trace:`, error.stack);
      throw error;
    }

    return client;
  } catch (error) {
    console.error(`DEBUG - Error creating SogniClient instance:`, error);
    throw error;
  }
} 

// Get client info (for testing connection)
export async function getClientInfo() {
  console.log('DEBUG - getClientInfo called, initializing Sogni client for status check');
  try {
    const client = await initializeSogniClient();
    console.log('DEBUG - Successfully initialized client for status check');
    
    // Get basic client info without exposing sensitive data
    const info = {
      connected: true,
      appId: client.appId,
      network: client.network,
      authenticated: client.account.isLoggedIn()
    };
    
    console.log(`DEBUG - Status info: ${JSON.stringify(info)}`);
    return info;
  } catch (error) {
    console.error('DEBUG - Error in getClientInfo:', error);
    throw error;
  }
}

// Generate image using Sogni client
export async function generateImage(params) {
  console.log('DEBUG - generateImage called with params:', {
    modelId: params.selectedModel,
    width: params.width,
    height: params.height,
    guidance: params.promptGuidance,
    numberImages: params.numberImages,
    controlNetStrength: params.controlNetStrength,
    controlNetGuidanceEnd: params.controlNetGuidanceEnd,
    // Not logging the full image data as it's too large
    imageDataSize: params.imageData ? params.imageData.length : 'not provided'
  });
  
  try {
    console.log('DEBUG - Initializing Sogni client for image generation');
    const client = await initializeSogniClient();
    console.log('DEBUG - Successfully initialized client for image generation');
    
    // Create the project with the received parameters
    console.log('DEBUG - Creating Sogni project');
    const project = await client.projects.create({
      modelId: params.selectedModel,
      positivePrompt: params.stylePrompt,
      sizePreset: 'custom',
      width: params.width,
      height: params.height,
      steps: 7,
      guidance: params.promptGuidance,
      numberOfImages: params.numberImages,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras',
      controlNet: {
        name: 'instantid',
        image: new Uint8Array(params.imageData),
        strength: params.controlNetStrength,
        mode: 'balanced',
        guidanceStart: 0,
        guidanceEnd: params.controlNetGuidanceEnd,
      }
    });
    
    console.log(`DEBUG - Project created successfully with ID: ${project.id}`);
    console.log(`DEBUG - Number of jobs created: ${project.jobs ? project.jobs.length : 'unknown'}`);
    
    // Set up a Promise to resolve when the project completes
    return new Promise((resolve, reject) => {
      const jobResults = new Map();
      const jobProgress = new Map();
      
      // Track overall project progress
      project.on('progress', (progress) => {
        console.log(`DEBUG - Project progress: ${progress * 100}%`);
      });
      
      // Handle individual job completion
      project.on('jobCompleted', (job) => {
        console.log(`DEBUG - Job completed: ${job.id}, has resultUrl: ${!!job.resultUrl}`);
        if (job.resultUrl) {
          jobResults.set(job.id, job.resultUrl);
          console.log(`DEBUG - Job result URL: ${job.resultUrl.substring(0, 100)}...`);
        }
        
        console.log(`DEBUG - Completed jobs: ${jobResults.size}/${params.numberImages}`);
        
        // Check if all jobs are complete
        if (jobResults.size === params.numberImages) {
          console.log('DEBUG - All jobs completed successfully');
          resolve({
            status: 'success',
            imageUrls: Array.from(jobResults.values())
          });
        }
      });
      
      // Handle job progress events
      project.on('job', (event) => {
        const { type, jobId, progress } = event;
        if (type === 'progress' && progress !== undefined) {
          console.log(`DEBUG - Job ${jobId} progress: ${progress * 100}%`);
          jobProgress.set(jobId, progress);
        } else {
          console.log(`DEBUG - Job event: ${type} for job ${jobId}`);
        }
      });
      
      // Handle individual job failure
      project.on('jobFailed', (job) => {
        console.error(`DEBUG - Job failed: ${job.id}, error: ${job.error}`);
        // Don't reject immediately, wait to see if other jobs succeed
        jobResults.set(job.id, null); // Mark as failed
        
        // If all jobs have reported (success or failure)
        if (jobResults.size === params.numberImages) {
          const successfulJobs = Array.from(jobResults.values()).filter(url => url !== null);
          console.log(`DEBUG - All jobs reported. Successful: ${successfulJobs.length}, Failed: ${params.numberImages - successfulJobs.length}`);
          
          // If all jobs failed, reject
          if (successfulJobs.length === 0) {
            console.error('DEBUG - All image generation jobs failed');
            reject(new Error('All image generation jobs failed'));
          } else {
            // Some succeeded, return those
            console.log(`DEBUG - Partial success, returning ${successfulJobs.length} images`);
            resolve({
              status: 'partial',
              imageUrls: successfulJobs
            });
          }
        }
      });
      
      // Handle overall project failure
      project.on('failed', (error) => {
        console.error(`DEBUG - Project failed: ${error.message}`);
        if (error.status) console.error(`DEBUG - Error status: ${error.status}`);
        if (error.payload) console.error(`DEBUG - Error payload:`, error.payload);
        reject(error);
      });
      
      // Add a timeout in case the project hangs
      console.log('DEBUG - Setting project timeout for 120 seconds');
      setTimeout(() => {
        if (jobResults.size < params.numberImages) {
          console.warn(`DEBUG - Project timeout reached. Completed: ${jobResults.size}/${params.numberImages}`);
          
          // If we have some results, return those
          if (jobResults.size > 0) {
            const successfulJobs = Array.from(jobResults.values()).filter(url => url !== null);
            console.log(`DEBUG - Returning ${successfulJobs.length} successful results before timeout`);
            resolve({
              status: 'timeout',
              imageUrls: successfulJobs
            });
          } else {
            console.error('DEBUG - Generation timed out with no successful jobs');
            reject(new Error('Generation timed out'));
          }
        }
      }, 120000); // 2 minute timeout
    });
  } catch (error) {
    console.error('DEBUG - Error in generateImage:', error);
    if (error.status) console.error(`DEBUG - Error status: ${error.status}`);
    if (error.payload) console.error(`DEBUG - Error payload:`, error.payload);
    throw error;
  }
} 