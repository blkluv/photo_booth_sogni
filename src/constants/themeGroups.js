// Theme groups for organizing style prompts
export const THEME_GROUPS = {
  'pro-editorial': {
    name: 'Pro / Editorial',
    prompts: ['bougieWhite', 'bougieBlack', 'filmGrainB&W', 'vintageHollywood', 'relaxBath']
  },
  'neon-vapor-glitch': {
    name: 'Neon / Vapor / Glitch', 
    prompts: [
      'neoNoir', 
      'vaporwave', 
      'synthwaveGrid', 
      'retroVHS', 
      'midnightNeon', 
      'neonTropical', 
      'neonZen', 
      'vectorWave', 
      'retroDecal', 
      'laserGrid', 
      'vaporStatue', 
      'sprayGlow', 
      'cosmicGraffiti', 
      'retroFuturist', 
      'pscyhedlicPortrait'
    ]
  },
  'raver-costume-space-party': {
    name: 'Raver / Costume / Space-Party',
    prompts: [
      'crownDrip', 
      'tarotGlitch', 
      'y2kRaverKid',
      'fingers4am', 
      'candyRaver',
      'spaceSlothi',
      'spaceBot',
      'tronDon',
      'tribalBruh'
    ]
  },
  'anime-manga-chibi': {
    name: 'Anime / Manga / Chibi',
    prompts: [
      'anime1990s',
      'animeKawaii', 
      'animeClassic',
      'comicManga',
      'jojoStandAura',
      'miyazakiFlying',
      'lunarChibi',
      'pixelChibi',
      'spaceChibi',
      'storybookYokai',
      'storybookSakura',
      'storybookNinja',
      'storybookChef',
      'ghibliMeadow'
    ]
  },
  'storybook-kidlit': {
    name: 'Storybook / Kidlit',
    prompts: [
      'storybookWatercolor',
      'storybookDragon',
      'storybookPirate',
      'storybookPrincess',
      'storybookElf',
      'storybookAstronaut',
      'storybookAstral',
      'storybookPuppy',
      'storybookMerCat',
      'storybookMermaidCat',
      'storybookPilot',
      'storybookViking',
      'storybookSnow',
      'storybookLion',
      'storybookMoon'
    ]
  },
  'pixel-nft-retro-game': {
    name: 'Pixel / NFT / Retro Game',
    prompts: [
      'nftCryptoPunk',
      'nftBoredApe',
      'nftDoodles',
      'nftAzuki',
      'pixelArt',
      'pixelPortrait',
      'pastelPixel',
      'pixelKnight',
      'dungeonCrawler',
      'arcadeVector'
    ]
  },
  'street-graffiti-poster': {
    name: 'Street / Graffiti / Poster',
    prompts: [
      'popGraffiti',
      'graffitiStencil',
      'rainbowGraffiti',
      'spraySticker',
      'punkPoster',
      'rockPoster70s',
      'collageMagazine',
      'bubbleComic',
      'vectorPop',
      'gridPaperDoodle',
      'chalkboard',
      'lowInkRiso',
      'gorillaz',
      'banksyStencil'
    ]
  },
  'classical-vintage': {
    name: 'Classical / Vintage',
    prompts: [
      'statueRoman',
      'royalBust',
      'polishedBronze',
      'gildedRenaissance',
      'neoBaroque',
      'stoneMoss',
      'sepiaDaguerreotype',
      'dapperVictorian'
    ]
  },
  'fantasy-sci-fi': {
    name: 'Fantasy / Sci-Fi',
    prompts: [
      'mythicMermaid',
      'sumiDragon',
      'celestialSketch',
      'arcticExplorer',
      'cyberGlow',
      'techBlueprint',
      'tikiRetro'
    ]
  },
  'materials-printmaking': {
    name: 'Materials / Printmaking',
    prompts: [
      'etchedCopper',
      'glazeCeramic',
      'inkWash',
      'woodcutInk',
      'etchingVintage',
      'charcoalGesture',
      'watercolorBleed',
      'sketchbookInk',
      'digitalLineArt',
      'dripPaint',
      'chalkPastel',
      'woodblockVintage',
      'cyanoBlueprint'
    ]
  },
  'comics-caricature': {
    name: 'Comics / Caricature (non-anime)',
    prompts: [
      'sketchCaricature',
      'digitalCaricature',
      'celShade3D'
    ]
  },
  'kitsch-gags-animals': {
    name: 'Kitsch / Gags / Animals',
    prompts: [
      'clownMakeup',
      'clownPastel',
      'kittySwarm',
      'llamaPhotobomb',
      'aHugFromSlothicorn'
    ]
  }
};

// Default state - all groups enabled
export const getDefaultThemeGroupState = () => {
  const defaultState = {};
  Object.keys(THEME_GROUPS).forEach(groupId => {
    defaultState[groupId] = true;
  });
  return defaultState;
};

// Get all prompts that are enabled based on theme group selections
export const getEnabledPrompts = (themeGroupState, allPrompts) => {
  const enabledPromptNames = [];
  
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      enabledPromptNames.push(...group.prompts);
    }
  });
  
  // Filter the allPrompts object to only include enabled prompts
  const enabledPrompts = {};
  Object.entries(allPrompts).forEach(([key, value]) => {
    if (key === 'custom' || key === 'random' || key === 'randomMix' || key === 'oneOfEach' || enabledPromptNames.includes(key)) {
      enabledPrompts[key] = value;
    }
  });
  
  return enabledPrompts;
};

// Get prompts in sequential order for "One of each plz" mode
export const getOneOfEachPrompts = (themeGroupState, allPrompts, count) => {
  const enabledGroups = [];
  
  // Get enabled groups in their defined order
  Object.entries(THEME_GROUPS).forEach(([groupId, group]) => {
    if (themeGroupState[groupId]) {
      enabledGroups.push(group);
    }
  });
  
  // If no themes are checked or all themes are checked, use alphabetical order from full list
  if (enabledGroups.length === 0 || enabledGroups.length === Object.keys(THEME_GROUPS).length) {
    const allPromptKeys = Object.keys(allPrompts)
      .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix' && key !== 'oneOfEach')
      .sort();
    
    const selectedPrompts = [];
    for (let i = 0; i < count && i < allPromptKeys.length; i++) {
      const promptKey = allPromptKeys[i];
      if (allPrompts[promptKey]) {
        selectedPrompts.push(allPrompts[promptKey]);
      }
    }
    
    return selectedPrompts.length > 0 ? `{${selectedPrompts.join('|')}}` : 'A creative portrait style';
  }
  
  // Use one prompt from each enabled group in order
  const selectedPrompts = [];
  let groupIndex = 0;
  
  for (let i = 0; i < count; i++) {
    if (enabledGroups.length === 0) break;
    
    const currentGroup = enabledGroups[groupIndex];
    const promptIndex = Math.floor(i / enabledGroups.length) % currentGroup.prompts.length;
    const promptKey = currentGroup.prompts[promptIndex];
    
    if (allPrompts[promptKey]) {
      selectedPrompts.push(allPrompts[promptKey]);
    }
    
    groupIndex = (groupIndex + 1) % enabledGroups.length;
  }
  
  return selectedPrompts.length > 0 ? `{${selectedPrompts.join('|')}}` : 'A creative portrait style';
};
