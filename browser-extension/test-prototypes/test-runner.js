// Test Runner for Sogni Photobooth Extension Prototypes
// Run this script in the browser console on any test prototype page

console.log('🧪 Sogni Extension Test Runner Starting...');

// Test configuration
const TESTS = {
  'salesforce-dreamforce-speakers.html': {
    expectedImages: 8,
    expectedContainers: 1,
    containerSelectors: ['speakers-container', 'speakers-grid'],
    imageSize: { min: 100, max: 200 },
    aspectRatio: { min: 0.8, max: 1.2 }
  },
  'salesforce-df25-speakers-exact.html': {
    expectedImages: 6,
    expectedContainers: 1,
    containerSelectors: ['speakers-grid', 'df25-speakers'],
    imageSize: { min: 110, max: 130 },
    aspectRatio: { min: 0.9, max: 1.1 },
    description: 'Exact replica of Salesforce DF25 speakers page structure'
  },
  'token2049-speakers.html': {
    expectedImages: 12,
    expectedContainers: 1,
    containerSelectors: ['speakers-grid', 'token2049-speakers'],
    imageSize: { min: 110, max: 130 },
    aspectRatio: { min: 0.9, max: 1.1 },
    description: 'Token2049 Singapore speakers page with dark theme and crypto industry speakers'
  },
  'netflix-leadership.html': {
    expectedImages: 6,
    expectedContainers: 1,
    containerSelectors: ['management-grid', 'netflix-management'],
    imageSize: { min: 250, max: 320 },
    aspectRatio: { min: 0.8, max: 1.1 },
    description: 'Netflix leadership page with management headshots and specific class structure'
  },
  'ai4-vegas-speakers.html': {
    expectedImages: 8,
    expectedContainers: 1,
    containerSelectors: ['speakers-grid', 'ai4-speakers'],
    imageSize: { min: 130, max: 150 },
    aspectRatio: { min: 0.9, max: 1.1 },
    description: 'AI4 Vegas conference speakers with modern gradient design and glass morphism'
  },
  'sogni-team.html': {
    expectedImages: 8,
    expectedContainers: 1,
    containerSelectors: ['team-grid', 'sogni-team'],
    imageSize: { min: 110, max: 130 },
    aspectRatio: { min: 0.9, max: 1.1 },
    description: 'Sogni company team page with animated gradients and floating particles'
  }
};

// Detect current test based on page URL or title
function detectCurrentTest() {
  const url = window.location.href;
  const title = document.title;
  
  for (const [testFile, config] of Object.entries(TESTS)) {
    if (url.includes(testFile) || 
        (testFile.includes('salesforce') && title.includes('Dreamforce')) ||
        (testFile.includes('df25') && title.includes('Dreamforce 25')) ||
        (testFile.includes('token2049') && title.includes('Token2049')) ||
        (testFile.includes('netflix') && title.includes('Netflix')) ||
        (testFile.includes('ai4') && title.includes('AI4')) ||
        (testFile.includes('sogni') && title.includes('Sogni'))) {
      return { testFile, config };
    }
  }
  
  return null;
}

// Run basic image detection tests
function runImageDetectionTests(config) {
  console.log('🔍 Running image detection tests...');
  
  // Test 1: Count total images
  const allImages = document.querySelectorAll('img');
  console.log(`📊 Total images found: ${allImages.length}`);
  
  // Test 2: Check image sizes and aspect ratios
  let validImages = 0;
  allImages.forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    const aspectRatio = rect.width / rect.height;
    
    console.log(`   Image ${index + 1}: ${rect.width}x${rect.height} (ratio: ${aspectRatio.toFixed(2)})`);
    
    if (rect.width >= config.imageSize.min && 
        rect.width <= config.imageSize.max &&
        aspectRatio >= config.aspectRatio.min && 
        aspectRatio <= config.aspectRatio.max) {
      validImages++;
    }
  });
  
  console.log(`✅ Valid profile-sized images: ${validImages}/${allImages.length}`);
  
  // Test 3: Check for expected containers
  let containersFound = 0;
  config.containerSelectors.forEach(selector => {
    const containers = document.querySelectorAll(`[class*="${selector}"], [id*="${selector}"]`);
    if (containers.length > 0) {
      containersFound++;
      console.log(`✅ Found container with "${selector}": ${containers.length} elements`);
    }
  });
  
  return {
    totalImages: allImages.length,
    validImages: validImages,
    containersFound: containersFound,
    passed: validImages >= config.expectedImages && containersFound >= config.expectedContainers
  };
}

// Simulate extension detection logic
function simulateExtensionDetection() {
  console.log('🤖 Simulating extension detection logic...');
  
  // Simulate container search
  const containerSelectors = [
    '[class*="speaker" i]',
    '[id*="speaker" i]',
    '[class*="profile" i]',
    '[id*="profile" i]'
  ];
  
  const containers = document.querySelectorAll(containerSelectors.join(', '));
  console.log(`🔍 Extension would find ${containers.length} profile containers`);
  
  containers.forEach((container, index) => {
    const images = container.querySelectorAll('img');
    console.log(`   Container ${index + 1}: "${container.className}" with ${images.length} images`);
  });
  
  // Simulate grid detection fallback
  if (containers.length === 0) {
    console.log('🔄 No containers found, testing grid detection fallback...');
    
    const allImages = document.querySelectorAll('img');
    const imageGroups = new Map();
    
    allImages.forEach(img => {
      const rect = img.getBoundingClientRect();
      const sizeKey = `${Math.round(rect.width / 50) * 50}x${Math.round(rect.height / 50) * 50}`;
      
      if (!imageGroups.has(sizeKey)) {
        imageGroups.set(sizeKey, []);
      }
      imageGroups.get(sizeKey).push(img);
    });
    
    let largestGroup = [];
    for (const group of imageGroups.values()) {
      if (group.length > largestGroup.length) {
        largestGroup = group;
      }
    }
    
    console.log(`🔍 Grid detection would find ${largestGroup.length} similar images`);
  }
}

// Main test function
function runTests() {
  console.log('🚀 Starting Sogni Extension Prototype Tests');
  console.log('=' .repeat(50));
  
  const currentTest = detectCurrentTest();
  
  if (!currentTest) {
    console.error('❌ Could not detect current test prototype');
    return false;
  }
  
  console.log(`📄 Running tests for: ${currentTest.testFile}`);
  console.log(`🎯 Expected images: ${currentTest.config.expectedImages}`);
  
  // Run tests
  const results = runImageDetectionTests(currentTest.config);
  simulateExtensionDetection();
  
  // Summary
  console.log('=' .repeat(50));
  console.log('📋 TEST SUMMARY');
  console.log(`Total Images: ${results.totalImages}`);
  console.log(`Valid Images: ${results.validImages}`);
  console.log(`Containers Found: ${results.containersFound}`);
  console.log(`Overall Result: ${results.passed ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (!results.passed) {
    console.warn('⚠️  This prototype may not work correctly with the extension');
  }
  
  return results.passed;
}

// Auto-run if not in extension context
if (typeof chrome === 'undefined' || !chrome.runtime) {
  console.log('🔧 Running in test mode (no extension detected)');
  runTests();
} else {
  console.log('🔌 Extension detected - use runTests() to manually run tests');
}

// Export for manual use
window.sogniTestRunner = {
  runTests,
  detectCurrentTest,
  runImageDetectionTests,
  simulateExtensionDetection
};
