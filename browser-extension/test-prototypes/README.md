# Sogni Photobooth Extension - Test Prototypes

This directory contains simplified HTML prototypes of real-world pages to ensure the browser extension continues working correctly across different site structures.

## Purpose

- **Regression Testing**: Prevent future changes from breaking previously working functionality
- **Quick Validation**: Test extension behavior without relying on external sites
- **Structure Analysis**: Understand what makes different page layouts work with the extension

## Test Prototypes

### 1. Salesforce Dreamforce Speakers (`salesforce-dreamforce-speakers.html`)

**Based on**: [Salesforce Dreamforce 2025 Speakers Page](https://reg.salesforce.com/flow/plus/df25/df25speakers/page/speakers)

**Key Features Tested**:
- Grid layout with speaker cards
- Circular profile images (150x150px)
- Container with "speakers" in class name
- Multiple similar-sized images for grid detection fallback

**Expected Extension Behavior**:
- Should detect 8 speaker images
- Images should pass profile validation (size, aspect ratio, context)
- Container detection should work via "speakers-container" class
- Grid fallback should work if container detection fails
- All images should convert and remain visible

**Test Status**: ✅ Working (as of latest update)

### 2. Salesforce DF25 Speakers - Exact Structure (`salesforce-df25-speakers-exact.html`)

**Based on**: [Salesforce Dreamforce 2025 Speakers Page](https://reg.salesforce.com/flow/plus/df25/df25speakers/page/speakers) (Exact replica)

**Key Features Tested**:
- Precise Salesforce styling and layout
- 120x120px circular speaker photos with borders
- "speakers-grid" container class
- Salesforce-specific card structure and hover effects
- Exact image dimensions and aspect ratios (1:1)

**Expected Extension Behavior**:
- Should detect 6 speaker images
- Container detection via "speakers-grid" class containing "speakers" keyword
- Perfect square images (120x120px) with 1:1 aspect ratio
- Grid fallback detection of 6 similar-sized images
- Successful conversion maintaining Salesforce layout

**Test Status**: ✅ Working (confirmed working on actual site)

**Special Notes**: This test specifically prevents regression for the exact Salesforce page structure that was previously broken and then fixed.

### 3. Token2049 Singapore Speakers (`token2049-speakers.html`)

**Based on**: [Token2049 Singapore Speakers Page](https://www.asia.token2049.com/speakers)

**Key Features Tested**:
- Dark theme crypto conference layout
- 120x120px circular speaker photos with blue borders
- Responsive grid with hover animations
- "speakers-grid" container class
- High-profile crypto industry speakers
- Load more functionality simulation

**Expected Extension Behavior**:
- Should detect 12 speaker images
- Container detection via "speakers-grid" class containing "speakers" keyword
- Perfect square images (120x120px) with 1:1 aspect ratio
- Grid fallback detection of 12 similar-sized images
- Successful conversion maintaining dark theme aesthetics
- Proper handling of hover effects and animations

**Test Status**: ✅ Working (confirmed working on actual site)

**Special Notes**: 
- Tests dark theme compatibility
- Validates crypto conference page structure
- Includes hover effects and modern web animations
- Simulates "Load More" functionality common in speaker pages

### 4. Netflix Leadership (`netflix-leadership.html`)

**Based on**: [Netflix Leadership Page (French)](https://about.netflix.com/fr/leadership)

**Key Features Tested**:
- Netflix dark theme with signature red branding
- Rectangular leadership photos (280x300px)
- Exact Netflix class structure: `management-gridstyles__Headshot-cmkolc-5 giPOsw`
- "management-grid" container class
- French language content
- Netflix-style hover effects and animations

**Expected Extension Behavior**:
- Should detect 6 leadership images
- Container detection via "management" keyword in class name
- Direct image class detection via "headshot" pattern in class name
- Rectangular images (280x300px) with ~0.93 aspect ratio
- Grid fallback detection of 6 similar-sized images
- Successful conversion maintaining Netflix branding and layout

**Test Status**: ✅ Working (confirmed working on actual site)

**Special Notes**: 
- **Critical Test**: This was the original failing page that required the extension fix
- Tests the exact Netflix class structure that was initially problematic
- Validates both "management" container detection and "headshot" image class detection
- Ensures rectangular (non-square) images are properly handled
- French language version tests international site compatibility

### 5. AI4 Vegas Speakers (`ai4-vegas-speakers.html`)

**Based on**: [AI4 Vegas Speakers Page](https://ai4.io/vegas/speakers/)

**Key Features Tested**:
- Modern AI conference design with gradient backgrounds
- Circular speaker photos (140x140px) with colored borders
- Glass morphism and backdrop blur effects
- "speakers-grid" container class
- Speaker tags and detailed biographies
- AI/ML industry focus with tech company speakers

**Expected Extension Behavior**:
- Should detect 8 speaker images
- Container detection via "speakers" keyword in class name
- Perfect square images (140x140px) with 1:1 aspect ratio
- Grid fallback detection of 8 similar-sized images
- Successful conversion maintaining modern gradient design
- Proper handling of glass morphism and backdrop effects

**Test Status**: ✅ Working (confirmed working on actual site)

**Special Notes**: 
- Tests modern web design patterns (gradients, glass morphism)
- Validates AI/tech conference page structure
- Includes interactive elements (tags, hover effects)
- Tests backdrop-filter CSS compatibility
- Represents contemporary conference website design trends

### 6. Sogni Team (`sogni-team.html`)

**Based on**: [Sogni Team Page](https://www.sogni.ai/team)

**Key Features Tested**:
- Sogni brand colors and animated gradients
- Circular team member photos (120x120px) with colored borders
- Animated background with radial gradients
- Floating particle effects and advanced CSS animations
- "team-grid" container class
- Backdrop blur and glass morphism effects
- Company team structure with executives and advisors

**Expected Extension Behavior**:
- Should detect 8 team member images
- Container detection via "team" keyword in class name
- Perfect square images (120x120px) with 1:1 aspect ratio
- Grid fallback detection of 8 similar-sized images
- Successful conversion maintaining Sogni's animated branding
- Proper handling of complex CSS animations and particle effects

**Test Status**: ✅ Working (confirmed working on actual site)

**Special Notes**: 
- **Critical Test**: This is Sogni's own company page - must always work
- Tests the most advanced CSS features (animations, particles, gradients)
- Validates company/team page structure
- Includes floating particle animations and background effects
- Represents Sogni's signature brand aesthetic
- Tests extension compatibility with complex animated backgrounds

---

## How to Use These Prototypes

1. **Open the HTML file** in your browser
2. **Load the Sogni Photobooth Extension**
3. **Activate the extension** on the test page
4. **Verify expected behavior**:
   - Check console logs for detection details
   - Ensure correct number of images are found
   - Test image conversion and visibility
   - Verify hover comparison functionality

## Adding New Prototypes

When adding a new test prototype:

1. **Create HTML file** with descriptive name
2. **Include test notes** section with:
   - Purpose and source URL
   - Expected behavior
   - Key features being tested
3. **Update this README** with new prototype details
4. **Test thoroughly** before marking as working

## Maintenance

- **Run tests** after any changes to the extension's image detection logic
- **Update prototypes** if they no longer match real-world behavior
- **Document any failures** and their resolutions
- **Keep prototypes simple** - focus on structure, not visual fidelity

---

*Last Updated: [Current Date]*
*Extension Version: 2.0+*
