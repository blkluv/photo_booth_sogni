/**
 * URL configurations for different environments
 */

interface EnvironmentURLs {
  publicUrl: string;
  apiUrl: string;
}

// Production URLs
const productionUrls: EnvironmentURLs = {
  publicUrl: 'https://superapps.sogni.ai/photobooth',
  apiUrl: 'https://superapps.sogni.ai/photobooth/api',
};

// Staging URLs
const stagingUrls: EnvironmentURLs = {
  publicUrl: 'http://photobooth-staging.sogni.ai',
  apiUrl: 'http://photobooth-staging.sogni.ai/api',
};

// Local development URLs
const developmentUrls: EnvironmentURLs = {
  publicUrl: 'http://localhost:5175',
  apiUrl: 'http://localhost:5175/api',
};

// Get URLs based on environment
export const getURLs = (): EnvironmentURLs => {
  const environment = import.meta.env.MODE || 'development';
  
  console.log(`Loading URLs for environment: ${environment}`);
  
  switch (environment) {
    case 'production':
      return productionUrls;
    case 'staging':
      return stagingUrls;
    case 'development':
    default:
      return developmentUrls;
  }
};

// Export default URLs
export default getURLs(); 