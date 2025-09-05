import { styleIdToDisplay } from './index';

/**
 * Maps gallery image filenames to prompt keys
 * Gallery images follow the pattern: sogni-photobooth-[promptkey]-raw.jpg
 */
const createFilenameToPromptMapping = (stylePrompts) => {
  const mapping = {};
  
  // Create mapping from filename patterns to prompt keys
  Object.keys(stylePrompts).forEach(promptKey => {
    if (promptKey === 'custom' || promptKey === 'random' || promptKey === 'randomMix' || promptKey === 'oneOfEach') {
      return; // Skip special prompt types
    }
    
    // Convert camelCase prompt key to lowercase for filename matching
    // Handle special cases and characters
    let filenameKey = promptKey.toLowerCase();
    
    // Handle special character replacements that might occur in filenames
    filenameKey = filenameKey.replace(/&/g, ''); // Remove & characters
    
    const expectedFilename = `sogni-photobooth-${filenameKey}-raw.jpg`;
    mapping[expectedFilename] = promptKey;
  });
  
  return mapping;
};

/**
 * Loads all gallery images and converts them to photo objects
 * @param {Object} stylePrompts - The available style prompts
 * @returns {Promise<Array>} Array of photo objects for the gallery
 */
export const loadGalleryImages = async (stylePrompts) => {
  try {
    const galleryPhotos = [];
    
    // List of known gallery image filenames (we'll match these to prompts)
    const knownGalleryFiles = [
      'sogni-photobooth-ahugfromslothicorn-raw.jpg',
      'sogni-photobooth-anime1990s-raw.jpg',
      'sogni-photobooth-animeclassic-raw.jpg',
      'sogni-photobooth-animekawaii-raw.jpg',
      'sogni-photobooth-arcadevector-raw.jpg',
      'sogni-photobooth-arcticexplorer-raw.jpg',
      'sogni-photobooth-banksystencil-raw.jpg',
      'sogni-photobooth-bougieblack-raw.jpg',
      'sogni-photobooth-bougiewhite-raw.jpg',
      'sogni-photobooth-bubblecomic-raw.jpg',
      'sogni-photobooth-candyraver-raw.jpg',
      'sogni-photobooth-celestialsketch-raw.jpg',
      'sogni-photobooth-celshade3d-raw.jpg',
      'sogni-photobooth-chalkboard-raw.jpg',
      'sogni-photobooth-chalkpastel-raw.jpg',
      'sogni-photobooth-charcoalgesture-raw.jpg',
      'sogni-photobooth-clownmakeup-raw.jpg',
      'sogni-photobooth-clownpastel-raw.jpg',
      'sogni-photobooth-collagemagazine-raw.jpg',
      'sogni-photobooth-comicmanga-raw.jpg',
      'sogni-photobooth-cosmicgraffiti-raw.jpg',
      'sogni-photobooth-crowndrip-raw.jpg',
      'sogni-photobooth-cyanoblueprint-raw.jpg',
      'sogni-photobooth-cyberglow-raw.jpg',
      'sogni-photobooth-dappervictorian-raw.jpg',
      'sogni-photobooth-digitalcaricature-raw.jpg',
      'sogni-photobooth-digitallineart-raw.jpg',
      'sogni-photobooth-drippaint-raw.jpg',
      'sogni-photobooth-dungeoncrawler-raw.jpg',
      'sogni-photobooth-etchedcopper-raw.jpg',
      'sogni-photobooth-etchingvintage-raw.jpg',
      'sogni-photobooth-filmgrainb&w-raw.jpg',
      'sogni-photobooth-fingers4am-raw.jpg',
      'sogni-photobooth-ghiblimeadow-raw.jpg',
      'sogni-photobooth-gildedrenaissance-raw.jpg',
      'sogni-photobooth-glazeceramic-raw.jpg',
      'sogni-photobooth-gorillaz-raw .jpg', // Note: has space in actual filename
      'sogni-photobooth-graffitistencil-raw.jpg',
      'sogni-photobooth-gridpaperdoodle-raw.jpg',
      'sogni-photobooth-inkwash-raw.jpg',
      'sogni-photobooth-jojostandaura-raw.jpg',
      'sogni-photobooth-kittyswarm-raw.jpg',
      'sogni-photobooth-lasergrid-raw.jpg',
      'sogni-photobooth-llamaphotobomb-raw.jpg',
      'sogni-photobooth-lowinkriso-raw.jpg',
      'sogni-photobooth-lunarchibi-raw.jpg',
      'sogni-photobooth-midnightneon-raw.jpg',
      'sogni-photobooth-miyazakiflying-raw.jpg',
      'sogni-photobooth-mythicmermaid-raw.jpg',
      'sogni-photobooth-neobaroque-raw.jpg',
      'sogni-photobooth-neonoir-raw.jpg',
      'sogni-photobooth-neontropical-raw.jpg',
      'sogni-photobooth-neonzen-raw.jpg',
      'sogni-photobooth-nftazuki-raw.jpg',
      'sogni-photobooth-nftboredape-raw.jpg',
      'sogni-photobooth-nftcryptopunk-raw.jpg',
      'sogni-photobooth-nftdoodles-raw.jpg',
      'sogni-photobooth-pastelpixel-raw.jpg',
      'sogni-photobooth-pixelart-raw.jpg',
      'sogni-photobooth-pixelchibi-raw.jpg',
      'sogni-photobooth-pixelknight-raw.jpg',
      'sogni-photobooth-pixelportrait-raw.jpg',
      'sogni-photobooth-polishedbronze-raw.jpg',
      'sogni-photobooth-popgraffiti-raw.jpg',
      'sogni-photobooth-pscyhedlicportrait-raw.jpg',
      'sogni-photobooth-punkposter-raw.jpg',
      'sogni-photobooth-rainbowgraffiti-raw.jpg',
      'sogni-photobooth-relaxbath-raw.jpg',
      'sogni-photobooth-retrodecal-raw.jpg',
      'sogni-photobooth-retrofuturist-raw.jpg',
      'sogni-photobooth-retrovhs-raw.jpg',
      'sogni-photobooth-rockposter70s-raw.jpg',
      'sogni-photobooth-royalbust-raw.jpg',
      'sogni-photobooth-sepiadaguerreotype-raw.jpg',
      'sogni-photobooth-sketchbookink-raw.jpg',
      'sogni-photobooth-sketchcaricature-raw.jpg',
      'sogni-photobooth-spacebot-raw.jpg',
      'sogni-photobooth-spacechibi-raw.jpg',
      'sogni-photobooth-spaceslothi-raw.jpg',
      'sogni-photobooth-sprayglow-raw.jpg',
      'sogni-photobooth-spraysticker-raw.jpg',
      'sogni-photobooth-statueroman-raw.jpg',
      'sogni-photobooth-stonemoss-raw.jpg',
      'sogni-photobooth-storybookastral-raw.jpg',
      'sogni-photobooth-storybookastronaut-raw.jpg',
      'sogni-photobooth-storybookchef-raw.jpg',
      'sogni-photobooth-storybookdragon-raw.jpg',
      'sogni-photobooth-storybookelf-raw.jpg',
      'sogni-photobooth-storybooklion-raw.jpg',
      'sogni-photobooth-storybookmercat-raw.jpg',
      'sogni-photobooth-storybookmermaidcat-raw.jpg',
      'sogni-photobooth-storybookmoon-raw.jpg',
      'sogni-photobooth-storybookninja-raw.jpg',
      'sogni-photobooth-storybookpilot-raw.jpg',
      'sogni-photobooth-storybookpirate-raw.jpg',
      'sogni-photobooth-storybookprincess-raw.jpg',
      'sogni-photobooth-storybookpuppy-raw.jpg',
      'sogni-photobooth-storybooksakura-raw.jpg',
      'sogni-photobooth-storybooksnow-raw.jpg',
      'sogni-photobooth-storybookviking-raw.jpg',
      'sogni-photobooth-storybookwatercolor-raw.jpg',
      'sogni-photobooth-storybookyokai-raw.jpg',
      'sogni-photobooth-sumidragon-raw.jpg',
      'sogni-photobooth-synthwavegrid-raw.jpg',
      'sogni-photobooth-tarotglitch-raw.jpg',
      'sogni-photobooth-techblueprint-raw.jpg',
      'sogni-photobooth-tikiretro-raw.jpg',
      'sogni-photobooth-tribalbruh-raw.jpg',
      'sogni-photobooth-trondon-raw.jpg',
      'sogni-photobooth-vaporstatue-raw.jpg',
      'sogni-photobooth-vaporwave-raw.jpg',
      'sogni-photobooth-vectorpop-raw.jpg',
      'sogni-photobooth-vectorwave-raw.jpg',
      'sogni-photobooth-vintagehollywood-raw.jpg',
      'sogni-photobooth-watercolorbleed-raw.jpg',
      'sogni-photobooth-woodblockvintage-raw.jpg',
      'sogni-photobooth-woodcutink-raw.jpg',
      'sogni-photobooth-y2kraverkid-raw.jpg'
    ];
    
    // Create mapping from filename to prompt key
    const filenameToPromptKey = {};
    
    // Try to match each filename to a prompt key
    knownGalleryFiles.forEach(filename => {
      // Extract the key part from filename: sogni-photobooth-[key]-raw.jpg
      const keyPart = filename.replace('sogni-photobooth-', '').replace('-raw.jpg', '');
      
      // Find matching prompt key (case-insensitive, handle special characters)
      const matchingPromptKey = Object.keys(stylePrompts).find(promptKey => {
        if (promptKey === 'custom' || promptKey === 'random' || promptKey === 'randomMix' || promptKey === 'oneOfEach') {
          return false;
        }
        
        // Normalize both for comparison
        const normalizedPromptKey = promptKey.toLowerCase().replace(/&/g, '');
        const normalizedKeyPart = keyPart.toLowerCase().replace(/&/g, '').trim(); // Handle & and spaces
        
        return normalizedPromptKey === normalizedKeyPart;
      });
      
      if (matchingPromptKey) {
        filenameToPromptKey[filename] = matchingPromptKey;
      }
    });
    
    // Create gallery photos for matched files
    let photoIndex = 0;
    for (const [filename, promptKey] of Object.entries(filenameToPromptKey)) {
      const imagePath = `/gallery/prompts/${filename}`;
      
      // Check if image exists before adding it
      const imageExists = await checkImageExists(imagePath);
      if (!imageExists) {
        console.warn(`Gallery image not found: ${imagePath}`);
        continue;
      }
      
      // Create photo object similar to generated photos
      const galleryPhoto = {
        id: `gallery-${promptKey}-${Date.now()}-${photoIndex}`,
        generating: false,
        loading: false,
        images: [imagePath],
        originalDataUrl: imagePath,
        newlyArrived: false,
        isOriginal: false,
        sourceType: 'gallery',
        // Add prompt information for the polaroid tag
        promptKey: promptKey,
        promptDisplay: styleIdToDisplay(promptKey),
        promptText: stylePrompts[promptKey] || '',
        // Assign frame numbers for equal distribution (1-6)
        taipeiFrameNumber: (photoIndex % 6) + 1,
        framePadding: 0,
        // Mark as gallery image to prevent custom frame application
        isGalleryImage: true
      };
      
      galleryPhotos.push(galleryPhoto);
      photoIndex++;
    }
    
    console.log(`Loaded ${galleryPhotos.length} gallery images`);
    return galleryPhotos;
    
  } catch (error) {
    console.error('Error loading gallery images:', error);
    return [];
  }
};

/**
 * Checks if an image file exists at the given path
 * @param {string} imagePath - Path to the image
 * @returns {Promise<boolean>} True if image exists and loads successfully
 */
export const checkImageExists = (imagePath) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imagePath;
  });
};
