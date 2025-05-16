import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AppProvider } from './context/AppContext';
import { initializeGA } from './utils/analytics';

// Initialize Google Analytics after a slight delay
// This helps prevent initialization timing issues
setTimeout(() => {
  initializeGA();
}, 50);

ReactDOM.createRoot(document.querySelector('#root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
