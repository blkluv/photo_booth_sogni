// Google Analytics utility for Sogni Photobooth
// This file handles analytics initialization and tracking

/**
 * Configuration values for Google Analytics
 * These can be set in .env.local with:
 * VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
 * VITE_GA_DOMAIN=sogni.ai
 * VITE_GA_ENABLED=true|false
 */
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const GA_DOMAIN = import.meta.env.VITE_GA_DOMAIN || 'auto';
const GA_ENABLED = import.meta.env.VITE_GA_ENABLED !== 'false';

// App version for version tracking
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

/**
 * Initialize Google Analytics
 * This function:
 * 1. Checks if GA is enabled and has a measurement ID
 * 2. Injects the gtag.js script into the document head
 * 3. Initializes the dataLayer
 * 4. Configures the GA tracker with custom parameters
 */
export const initializeGA = () => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID) {
    console.log('❌ Google Analytics is disabled or measurement ID is not provided');
    return;
  }

  try {
    // Create dataLayer array before defining gtag
    window.dataLayer = window.dataLayer || [];
    
    // Define gtag using a function expression instead of declaration
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    
    // Set initial dataLayer values
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      cookie_domain: GA_DOMAIN,
      send_page_view: true,
      app_version: APP_VERSION,
      anonymize_ip: true,
    });

    // Only after gtag is defined properly, load the script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  } catch (error) {
    console.error('Error initializing Google Analytics:', error);
  }
};

/**
 * Track page views
 * @param {string} path - The path/page to track
 */
export const trackPageView = (path) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
      app_version: APP_VERSION, // Include version in page view
    });
    console.log(`📊 Page view tracked: ${path}`);
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
};

/**
 * Track events
 * @param {string} category - Event category
 * @param {string} action - Event action
 * @param {string|null} label - Event label (optional)
 * @param {number|null} value - Event value (optional)
 */
export const trackEvent = (category, action, label = null, value = null) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const eventParams = {
      event_category: category,
      app_version: APP_VERSION, // Include version in events
    };

    if (label !== null) {
      eventParams.event_label = label;
    }

    if (value !== null) {
      eventParams.value = value;
    }

    window.gtag('event', action, eventParams);
  } catch (error) {
    console.error('Error tracking event:', error);
  }
};

/**
 * Check if Google Analytics is properly loaded and working
 * @returns {boolean} Whether GA is functioning
 */
export const isGAWorking = () => {
  return !!(GA_ENABLED && GA_MEASUREMENT_ID && window.gtag && window.dataLayer);
}; 