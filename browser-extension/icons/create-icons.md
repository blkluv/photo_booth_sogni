# Extension Icons

This extension needs the following icon files:

- `icon16.png` - 16x16 pixels (toolbar)
- `icon32.png` - 32x32 pixels (toolbar retina)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Icon Design

The icons should feature a pirate theme to match the extension's purpose:
- Pirate flag (🏴‍☠️) or skull and crossbones
- Orange/red color scheme matching the extension UI
- Clean, recognizable design at small sizes

## Temporary Solution

For development, you can use emoji-based icons or simple colored squares. The manifest.json references these files, so they need to exist for the extension to load properly.

## Creating Icons

You can create these icons using:
1. Any image editor (Photoshop, GIMP, Canva, etc.)
2. Online icon generators
3. Convert from SVG using tools like ImageMagick
4. Use the pirate emoji (🏴‍☠️) as a base and export at different sizes

Example command to create from emoji (requires system with emoji support):
```bash
# This is just an example - actual implementation depends on your system
convert -background transparent -fill "#ff6b35" -font "Apple Color Emoji" -pointsize 128 label:"🏴‍☠️" icon128.png
```
