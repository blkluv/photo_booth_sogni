# Sogni Photobooth

This project captures a webcam image, calls the **Sogni** AI generation API, and displays generated images on the screen with support for a thumbnail gallery.

## Features
1. **Realtime Camera Preview**
   - Displays your webcam feed in the background.

2. **Style Prompts**
   - Choose from predefined style prompts (anime, Gorillaz, Disney, pixel art, steampunk, vaporwave) or create your own.

3. **Generation Countdown**
   - When a new thumbnail is generating, it displays a 10-second countdown. If the generation completes sooner, the final image appears right away.

4. **Camera Switching**
   - If multiple cameras are found, you can select which camera to use in the “Settings” panel.

5. **Original Photo Retention**
   - Optionally keep the original photo as a fifth image in the generated stack.

6. **Keyboard Shortcuts**
   - **Escape**: Return to the live camera (if you are viewing a selected photo).
   - **Arrow Left / Right**: Browse to the previous/next photo.
   - **Arrow Up / Down**: Within a selected photo, view different generated images.
   - **Spacebar**: Quickly toggle between the generated image and the original (if original is included).

## Usage

1. **Install & Set Up**
   - Run `npm install` (or `yarn`) to install dependencies.
   - Set up your Sogni credentials in `.env` or environment variables:
     ```bash
     VITE_SOGNI_APP_ID=YourSogniAppID
     VITE_SOGNI_USERNAME=YourUsername
     VITE_SOGNI_PASSWORD=YourPassword
     ```
   - Ensure you have a local dev server environment (e.g., Vite).

2. **Run the App**
   - `npm run dev` (or `yarn dev`) to start the local development server.
   - Open your browser to the indicated URL (commonly `http://localhost:5173`).

3. **Camera Permissions**
   - The browser will ask for permission to use your webcam.
   - In the “Settings” panel, you can switch to another camera device if multiple are available.

4. **Generate**
   - Click **Take Photo**.
   - A quick 3-second countdown occurs (with an optional flash overlay).
   - A 10-second generation countdown will show on the thumbnail until the result is ready.

5. **Deleting Photos**
   - When viewing a generated photo in the gallery (thumbnail selected), a small **X** button appears at its top-left corner. Clicking it deletes that photo from the list.

## Project Structure

- **/src**
  - **App.jsx**: Core logic handling the webcam, capturing photos, and calling the Sogni API.
  - **index.jsx**: Entry point to mount `App` in React.
  - **index.css**: Tailwind + custom styling.

