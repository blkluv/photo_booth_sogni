// This file is now simplified since the backend handles Sogni API calls
// We're keeping it for backward compatibility with other parts of the codebase

// Use production as the default since the backend will handle the actual environment
export const SOGNI_URLS = {
  socket: "wss://socket.sogni.ai", 
  api: "https://api.sogni.ai"
}; 