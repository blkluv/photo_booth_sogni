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
  console.log('🚀 Extension popup opened - directly opening Style Explorer');
  
  // Initialize API
  api = new PhotoboothAPI();
  
  // Load dev mode setting
  await loadDevModeSettings();
  
  // Setup event listeners
  setupEventListeners();
  
  // Activate extension and directly open Style Explorer
  try {
    await activateExtensionAndOpenStyleExplorer();
    console.log('Style Explorer activation completed');
  } catch (error) {
    console.error('Error activating Style Explorer:', error);
  }
  
  // Close the popup since we're opening Style Explorer (with delay for debugging)
  setTimeout(() => {
    window.close();
  }, 2000); // 2 second delay to see any errors
});

// Load dev mode settings
async function loadDevModeSettings() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['devMode'], resolve);
    });
    
    const isDevMode = result.devMode || false;
    const toggle = document.getElementById('dev-mode-toggle');
    if (toggle) {
      toggle.checked = isDevMode;
    }
    
    console.log('Dev mode loaded:', isDevMode);
  } catch (error) {
    console.error('Error loading dev mode settings:', error);
  }
}

// Activate extension and directly open Style Explorer
async function activateExtensionAndOpenStyleExplorer() {
  console.log('Activating extension and opening Style Explorer directly...');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Send message to content script to open Style Explorer directly
    console.log('Sending message to open Style Explorer directly...');
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'openStyleExplorerDirect' });
      console.log('Style Explorer opened successfully:', response);
    } catch (messageError) {
      console.error('Failed to open Style Explorer:', messageError);
      console.log('This might be because the content script is not yet loaded on this page.');
      
      // Fallback 1 - try to activate extension first, then open Style Explorer
      try {
        console.log('Attempting to activate extension first...');
        await chrome.tabs.sendMessage(tab.id, { action: 'activateExtension' });
        console.log('Extension activated, now trying to open Style Explorer...');
        
        // Wait a moment for activation to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try again to open Style Explorer
        const secondAttempt = await chrome.tabs.sendMessage(tab.id, { action: 'openStyleExplorerDirect' });
        console.log('Style Explorer opened on second attempt:', secondAttempt);
        
      } catch (fallbackError) {
        console.error('Fallback activation also failed:', fallbackError);
        console.log('The page might not support the extension or content script failed to load.');
        
        // Final fallback - try to inject and execute script directly
        try {
          console.log('Attempting direct script injection...');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Direct inline Style Explorer creation
              console.log('Direct script execution - creating Style Explorer overlay');
              
              // Check if overlay already exists
              if (document.getElementById('sogni-style-explorer-overlay')) {
                console.log('Style Explorer overlay already exists');
                return;
              }
              
              // Create overlay
              const overlay = document.createElement('div');
              overlay.id = 'sogni-style-explorer-overlay';
              overlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: transparent !important;
                z-index: 999999 !important;
              `;
              
              // Create iframe
              const iframe = document.createElement('iframe');
              iframe.src = 'https://photobooth.sogni.ai/?page=prompts&extension=true&skipWelcome=true&t=' + Date.now();
              iframe.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                background: transparent !important;
              `;
              
              // Create close button
              const closeButton = document.createElement('button');
              closeButton.innerHTML = '✕';
              closeButton.style.cssText = `
                position: absolute !important;
                top: 20px !important;
                right: 20px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                color: white !important;
                font-size: 24px !important;
                cursor: pointer !important;
                padding: 8px 12px !important;
                border-radius: 50% !important;
                width: 44px !important;
                height: 44px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 1000000 !important;
              `;
              
              closeButton.onclick = () => {
                overlay.remove();
              };
              
              overlay.appendChild(iframe);
              overlay.appendChild(closeButton);
              document.body.appendChild(overlay);
              
              console.log('Style Explorer overlay created via direct injection');
            }
          });
          console.log('Direct script injection completed');
        } catch (scriptError) {
          console.error('Direct script injection failed:', scriptError);
        }
      }
    }
    
  } catch (error) {
    console.error('Failed to activate extension and open Style Explorer:', error);
  }
}

// Activate extension on current page (legacy function)
async function activateExtension() {
  console.log('Activating extension on current page...');
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab found:', tab.url);
    
    // Send activation message to content script
    console.log('Sending activation message to content script...');
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'activateExtension' });
      console.log('Extension activated successfully:', response);
    } catch (messageError) {
      console.error('Failed to send activation message to content script:', messageError);
      // This is not critical - the user can still use the extension
    }
    
  } catch (error) {
    console.error('Failed to activate extension:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Help and about links (only if they exist)
  const helpLink = document.getElementById('help-link');
  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      showHelp();
    });
  }
  
  const aboutLink = document.getElementById('about-link');
  if (aboutLink) {
    aboutLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAbout();
    });
  }
  
  // Dev mode toggle
  const devModeToggle = document.getElementById('dev-mode-toggle');
  if (devModeToggle) {
    devModeToggle.addEventListener('change', (e) => {
      const isDevMode = e.target.checked;
      console.log('Dev mode toggled:', isDevMode);
      
      // Save dev mode setting
      chrome.storage.local.set({ devMode: isDevMode }, () => {
        console.log('Dev mode setting saved:', isDevMode);
      });
      
      // Send message to content script about dev mode change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateDevMode', 
            devMode: isDevMode 
          });
        }
      });
    });
  }
}

// Check API status
async function checkApiStatus() {
  const statusElement = document.getElementById('api-status');
  
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

// Production mode - dev mode settings removed

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
Sogni Style Explorer Help

HOW TO USE:
1. Navigate to a webpage with profile photos (like speaker listings, team pages, etc.)
2. Click the Sogni logo in the top-left corner to open the Style Explorer
3. Browse hundreds of AI styles and click "Use This Style" on any photo
4. Watch as all profile photos on the page transform with your chosen style!

WHAT IT LOOKS FOR:
- Images in containers with "speaker", "profile", "team", or "member" in their class/id
- Square-ish images between 50x50 and 800x800 pixels
- Images arranged in grid patterns

FEATURES:
- Hundreds of AI transformation styles
- Real-time progress tracking
- Hover to compare original vs transformed
- Powered by Sogni.XLT SDXL Turbo AI

TROUBLESHOOTING:
- If "API Unavailable" appears, check your internet connection
- If no profiles found, try right-clicking individual images
- Processing may take 1-2 minutes per image depending on server load
  `;
  
  alert(helpText);
}

// Show about dialog
function showAbout() {
  const aboutText = `
Sogni Style Explorer v1.0.0

This browser extension brings the full power of Sogni Photobooth's AI style transformation to any webpage. Browse hundreds of artistic styles and transform profile photos with cutting-edge AI technology.

Created for automatically transforming speaker photos, team member photos, and other profile image grids with your choice of artistic styles.

Technology:
- Sogni.XLT SDXL Turbo AI Model
- Hundreds of curated artistic styles
- Chrome Extension Manifest V3
- Real-time progress tracking
- Advanced image processing pipeline

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
