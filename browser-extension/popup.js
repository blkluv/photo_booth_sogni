// Popup Script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Popup script loaded');

let api = null;
let sessionStats = {
  imagesFound: 0,
  imagesConverted: 0,
  startTime: null
};

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing popup...');
  
  // Initialize API
  api = new PhotoboothAPI();
  
  // Setup event listeners
  setupEventListeners();
  
  // Check API status
  await checkApiStatus();
  
  // Load session stats
  loadSessionStats();
});

// Setup event listeners
function setupEventListeners() {
  // Scan page button
  const scanBtn = document.getElementById('scan-page-btn');
  scanBtn.addEventListener('click', handleScanPage);
  
  // Help and about links
  document.getElementById('help-link').addEventListener('click', (e) => {
    e.preventDefault();
    showHelp();
  });
  
  document.getElementById('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    showAbout();
  });
}

// Check API status
async function checkApiStatus() {
  const statusElement = document.getElementById('api-status');
  const scanBtn = document.getElementById('scan-page-btn');
  
  try {
    console.log('Checking API status via background script...');
    statusElement.innerHTML = `
      <span class="status-indicator checking"></span>
      Checking...
    `;
    
    // Check API status through background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkApiHealth' }, (response) => {
        resolve(response || { connected: false, error: 'No response from background script' });
      });
    });
    
    console.log('API status response:', response);
    
    if (response.connected) {
      statusElement.innerHTML = `
        <span class="status-indicator connected"></span>
        Connected
      `;
      scanBtn.disabled = false;
      console.log('API is connected');
    } else {
      throw new Error(response.error || 'Connection failed');
    }
    
  } catch (error) {
    console.error('API status check failed:', error);
    statusElement.innerHTML = `
      <span class="status-indicator error"></span>
      Offline
    `;
    scanBtn.disabled = true;
    scanBtn.innerHTML = `
      <span class="btn-icon">⚠️</span>
      <span class="btn-text">API Unavailable</span>
    `;
  }
}

// Handle scan page button click
async function handleScanPage() {
  console.log('Scan page button clicked');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Update UI to processing state
    updateUIState('processing');
    
    // Send message to content script and wait for response
    console.log('Sending message to content script...');
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanPageForProfiles' });
      console.log('Content script response:', response);
      
      if (response && response.success) {
        // Success - update UI and show results
        updateUIState('success');
        sessionStats.imagesFound = response.result.imagesFound || 0;
        updateSessionStats();
        
        const scanBtn = document.getElementById('scan-page-btn');
        scanBtn.innerHTML = `
          <span class="btn-icon">🏴‍☠️</span>
          <span class="btn-text">Converting ${response.result.imagesFound} Images...</span>
        `;
        
        // Keep popup open to show progress
        console.log('Conversion started successfully');
        
      } else {
        // Handle error response from content script
        throw new Error(response?.error || 'Unknown error from content script');
      }
      
    } catch (messageError) {
      console.error('Failed to send message to content script:', messageError);
      
      // Show user-friendly error
      updateUIState('error');
      
      // Don't close popup, show error message
      const scanBtn = document.getElementById('scan-page-btn');
      scanBtn.innerHTML = `
        <span class="btn-icon">❌</span>
        <span class="btn-text">Content Script Error</span>
      `;
      
      // Show detailed error in console and alert
      alert(`Extension Error: ${messageError.message}\n\nThis usually means:\n1. The page hasn't fully loaded yet\n2. The content script failed to inject\n3. The page blocks extensions\n\nTry refreshing the page and try again.`);
      
      setTimeout(() => {
        resetUIState();
      }, 3000);
      
      return; // Don't close popup on error
    }
    
    // Start session timer
    sessionStats.startTime = Date.now();
    updateSessionStats();
    
    // Don't close popup immediately - let user see what's happening
    console.log('Message sent successfully, keeping popup open for feedback');
    
  } catch (error) {
    console.error('Failed to scan page:', error);
    updateUIState('error');
    alert(`Failed to scan page: ${error.message}`);
  }
}

// Update UI state
function updateUIState(state) {
  const container = document.querySelector('.popup-container');
  const scanBtn = document.getElementById('scan-page-btn');
  
  // Remove existing state classes
  container.classList.remove('processing', 'success', 'error');
  
  // Add new state class
  container.classList.add(state);
  
  switch (state) {
    case 'processing':
      scanBtn.innerHTML = `
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">Processing...</span>
      `;
      scanBtn.disabled = true;
      break;
      
    case 'success':
      scanBtn.innerHTML = `
        <span class="btn-icon">✅</span>
        <span class="btn-text">Conversion Complete!</span>
      `;
      setTimeout(() => {
        resetUIState();
      }, 3000);
      break;
      
    case 'error':
      scanBtn.innerHTML = `
        <span class="btn-icon">❌</span>
        <span class="btn-text">Error Occurred</span>
      `;
      setTimeout(() => {
        resetUIState();
      }, 3000);
      break;
  }
}

// Reset UI to default state
function resetUIState() {
  const container = document.querySelector('.popup-container');
  const scanBtn = document.getElementById('scan-page-btn');
  
  container.classList.remove('processing', 'success', 'error');
  scanBtn.innerHTML = `
    <span class="btn-icon">🔍</span>
    <span class="btn-text">Scan Page for Profiles</span>
  `;
  scanBtn.disabled = false;
}

// Load session stats from storage
async function loadSessionStats() {
  try {
    const result = await chrome.storage.local.get(['sessionStats']);
    if (result.sessionStats) {
      sessionStats = { ...sessionStats, ...result.sessionStats };
      updateSessionStatsDisplay();
      
      // Show stats section if there are stats to show
      if (sessionStats.imagesFound > 0 || sessionStats.imagesConverted > 0) {
        document.getElementById('stats-section').style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Failed to load session stats:', error);
  }
}

// Update session stats
function updateSessionStats() {
  // Save to storage
  chrome.storage.local.set({ sessionStats });
  updateSessionStatsDisplay();
  
  // Show stats section
  document.getElementById('stats-section').style.display = 'block';
}

// Update session stats display
function updateSessionStatsDisplay() {
  document.getElementById('images-found').textContent = sessionStats.imagesFound;
  document.getElementById('images-converted').textContent = sessionStats.imagesConverted;
  
  // Calculate elapsed time
  if (sessionStats.startTime) {
    const elapsed = Math.floor((Date.now() - sessionStats.startTime) / 1000);
    document.getElementById('conversion-time').textContent = `${elapsed}s`;
  }
}

// Show help dialog
function showHelp() {
  const helpText = `
Sogni Photobooth Pirate Converter Help

HOW TO USE:
1. Navigate to a webpage with profile photos (like speaker listings, team pages, etc.)
2. Click "Scan Page for Profiles" to automatically find and convert all profile photos
3. Or right-click on any individual image and select "Convert to Pirate"

WHAT IT LOOKS FOR:
- Images in containers with "speaker", "profile", "team", or "member" in their class/id
- Square-ish images between 50x50 and 800x800 pixels
- Images arranged in grid patterns

LIMITATIONS:
- Maximum 1 image processed at a time
- Images are resized to max 1080x1080 pixels
- Requires internet connection to Sogni API

TROUBLESHOOTING:
- If "API Unavailable" appears, check your internet connection
- If no profiles found, try right-clicking individual images
- Processing may take 1-3 minutes per image depending on server load
  `;
  
  alert(helpText);
}

// Show about dialog
function showAbout() {
  const aboutText = `
Sogni Photobooth Pirate Converter v1.0.0

This browser extension uses advanced AI to transform profile photos into pirate portraits. It integrates with the Sogni Photobooth API to provide high-quality image transformations.

Created for automatically converting speaker photos, team member photos, and other profile image grids into fun pirate versions.

Technology:
- Sogni AI Image Generation
- Chrome Extension Manifest V3
- Real-time progress tracking
- Batch processing with rate limiting

© 2024 Sogni AI
  `;
  
  alert(aboutText);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Popup received message:', message);
  
  if (message.action === 'updateStats') {
    sessionStats.imagesFound = message.imagesFound || sessionStats.imagesFound;
    sessionStats.imagesConverted = message.imagesConverted || sessionStats.imagesConverted;
    updateSessionStats();
  } else if (message.action === 'conversionComplete') {
    updateUIState('success');
  } else if (message.action === 'conversionError') {
    updateUIState('error');
  }
});

// Update stats display every second if processing
setInterval(() => {
  if (sessionStats.startTime && document.querySelector('.popup-container').classList.contains('processing')) {
    updateSessionStatsDisplay();
  }
}, 1000);
