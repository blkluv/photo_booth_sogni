import promptsData from '../prompts.json';

/**
 * Loads style prompts from various sources.
 * First tries the imported JSON, then fallbacks to fetching from different paths.
 */
export const loadPrompts = () => {
  if (typeof promptsData !== 'undefined' && Object.keys(promptsData).length > 0) {
    console.log('Prompts loaded from import');
    return Promise.resolve(promptsData);
  }
  
  console.warn('Prompts data not immediately available, attempting to fetch...');
  
  // Try multiple locations in order
  const tryFetchFromPath = (path) => {
    return fetch(path)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch from ${path}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`Successfully loaded prompts from ${path}`);
        return data;
      });
  };
  
  // Try multiple paths in sequence
  return tryFetchFromPath('/photobooth/prompts.json')
    .catch(error => {
      console.warn(error.message);
      return tryFetchFromPath('/prompts.json');
    })
    .catch(error => {
      console.warn(error.message);
      return tryFetchFromPath('./prompts.json');
    })
    .catch(error => {
      console.error('All attempts to fetch prompts failed:', error);
      return {}; // Return empty object as last resort
    });
};

/**
 * Initializes and returns an object with all available style prompts.
 */
export const initializeStylePrompts = async () => {
  try {
    const prompts = await loadPrompts();
    
    if (Object.keys(prompts).length === 0) {
      console.warn('No prompts loaded, using default empty prompt');
      return { custom: '' };
    }
    
    // Create sorted object with custom first
    const stylePrompts = {
      custom: '',
      ...Object.fromEntries(
        Object.entries(prompts)
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      )
    };
    
    // Add random style that will be resolved at generation time
    stylePrompts.random = 'RANDOM_SINGLE_STYLE';
    
    console.log('Prompts loaded successfully:', Object.keys(stylePrompts).length);
    return stylePrompts;
  } catch (error) {
    console.error('Error initializing prompts:', error);
    return { custom: '' };
  }
};

/**
 * Generates random prompts for multiple images
 */
export const generateRandomPrompts = (count, stylePrompts) => {
  // Get all prompts except 'custom' and 'random'
  const availablePrompts = Object.entries(stylePrompts)
    .filter(([key]) => key !== 'custom' && key !== 'random')
    .map(([key, value]) => ({ key, value }));
  
  // Shuffle array using Fisher-Yates algorithm
  for (let index = availablePrompts.length - 1; index > 0; index--) {
    const index_ = Math.floor(Math.random() * (index + 1));
    [availablePrompts[index], availablePrompts[index_]] = [availablePrompts[index_], availablePrompts[index]];
  }
  
  // Take first 'count' items and join their prompts
  const selectedPrompts = availablePrompts.slice(0, count);
  return `{${selectedPrompts.map(p => p.value).join('|')}}`;
};

/**
 * Gets a random style from the available styles
 */
export const getRandomStyle = (stylePrompts) => {
  const availableStyles = Object.keys(stylePrompts)
    .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach');
  
  if (availableStyles.length === 0) {
    console.warn('No styles available for random selection');
    return 'custom'; // Fallback to custom if no styles are available
  }
  
  return availableStyles[Math.floor(Math.random() * availableStyles.length)];
};

/**
 * Creates a mix of random prompts for multiple images
 */
export const getRandomMixPrompts = (count, stylePrompts) => {
  const availableStyles = Object.keys(stylePrompts)
    .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach');
  
  if (availableStyles.length === 0) {
    console.warn('No styles available for random mix');
    return 'A creative portrait style'; // Fallback if no styles are available
  }
  
  // Shuffle the available styles to ensure good distribution
  const shuffledStyles = [...availableStyles];
  for (let i = shuffledStyles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledStyles[i], shuffledStyles[j]] = [shuffledStyles[j], shuffledStyles[i]];
  }
  
  const selectedPrompts = [];
  for (let index = 0; index < count; index++) {
    // Cycle through shuffled styles to ensure good distribution
    const styleIndex = index % shuffledStyles.length;
    const selectedStyle = shuffledStyles[styleIndex];
    const prompt = stylePrompts[selectedStyle];
    if (prompt) {
      selectedPrompts.push(prompt);
    }
  }
  
  if (selectedPrompts.length === 0) {
    return 'A creative portrait style'; // Fallback if no valid prompts
  }
  
  return `{${selectedPrompts.join('|')}}`;
}; 