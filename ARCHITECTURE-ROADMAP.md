# Sogni Photobooth Architecture Roadmap & Development Guide

## 🎯 Purpose
This document captures critical architectural insights, proven patterns, and common pitfalls to guide current and future development of the Sogni Photobooth ecosystem. It serves as the authoritative reference for AI assistants and developers working on this project.

---

## 📋 Table of Contents
1. [Core Architecture Principles](#core-architecture-principles)
2. [Concurrent Processing Patterns](#concurrent-processing-patterns)
3. [Client App ID Management](#client-app-id-management)
4. [SSE Connection Strategies](#sse-connection-strategies)
5. [Browser Extension Architecture](#browser-extension-architecture)
6. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
7. [Debugging Guidelines](#debugging-guidelines)
8. [Future Development Guidelines](#future-development-guidelines)

---

## 🏗️ Core Architecture Principles

### System Overview
The Sogni Photobooth consists of three main components:
- **Frontend React App** (`src/`) - Main photobooth interface
- **Node.js Backend** (`server/`) - API proxy to Sogni Client SDK
- **Browser Extension** (`browser-extension/`) - Third-party website integration

### Key Architectural Decisions

#### 1. Backend as Sogni SDK Proxy
- **Why**: Avoids CORS issues and centralizes Sogni Client SDK management
- **Pattern**: Frontend/Extension → Backend API → Sogni Client SDK → Sogni Socket Service
- **Benefit**: Single point of authentication and connection management (secures the Sogni Credentials from client side scraping)

#### 2. 🔥 **CRITICAL: Single SDK Instance Per Backend Instance**
- **Fundamental Principle**: **ONE Sogni Client SDK instance per BACKEND INSTANCE**
- **Photobooth Backend**: Uses single `globalSogniClient` for ALL clients (frontend, browser extension, mobile app, etc.)
- **Key Insight**: All clients hitting the same backend share the same global SDK instance
- **Socket Connection Rule**: 1 backend instance = 1 SDK instance = 1 socket connection = unlimited concurrent projects
- **Concurrent Project Support**: Sogni Socket **fully supports** multiple concurrent project requests from same client
- **🚨 CRITICAL NOTE**: **SOGNI SDK DOES PROCESS PROJECTS CONCURRENTLY** - Do not conclude it's sequential!
- **Why This Matters**:
  - Sogni Socket Service allows 1 connection per appId, but offers up-to unlimited concurrent projects per connection (for allow-listed accounts)
  - Browser extension needs 1 project per image (due to controlnet image upload requirements)
  - Single SDK instance efficiently handles unlimited concurrent projects from all clients
  - Main frontend successfully runs 16-image batch + enhancement jobs concurrently

#### 3. Per-Client SDK Instance Management
- **Pattern**: One Sogni Client SDK instance per unique `clientAppId`
- **Server Logic**: `getSessionClient(sessionId, clientAppId)` creates dedicated SDK instances
- **Key Insight**: Multiple projects can run concurrently within the same SDK instance
- **Implementation**: Prevent concurrent SDK creation with same appId to avoid nonce races

#### 4. Event Streaming Architecture
- **SSE Endpoints**: 
  - `/progress/client?clientAppId=...` - For single client, multiple projects
  - `/progress/session` - For session-wide multiplexed streams
  - `/progress/:projectId` - Legacy per-project streams
- **Event Flow**: Sogni SDK → Server Event Handlers → SSE → Frontend/Extension

---

## ⚡ Concurrent Processing Patterns

### ✅ CORRECT Pattern: Single SDK Instance Per Application

**Photobooth Backend Architecture**:
```javascript
// SERVER-SIDE: Single global SDK instance for entire backend
let globalSogniClient = null;

// ALL clients use the same global instance
const client = await getOrCreateGlobalSogniClient(); // Same instance for all

// Main frontend projects
const project1 = await client.projects.create(params1); // 16-image batch
const project2 = await client.projects.create(params2); // Enhancement job

// Browser extension projects (same SDK instance!)
const project3 = await client.projects.create(params3); // Extension project 1
const project4 = await client.projects.create(params4); // Extension project 2

// Mobile app projects (same SDK instance!)
const project5 = await client.projects.create(params5); // Mobile project

// ... unlimited concurrent projects from ALL clients on same SDK instance
```

**Architecture Summary**:
- **Photobooth Backend**: ONE `globalSogniClient` for ALL clients (frontend, extension, mobile, etc.)
- **All Clients**: Share the same global SDK instance when hitting the same backend
- **Socket Connection**: Single connection supports unlimited concurrent projects from all clients
- **Key Rule**: ONE SDK instance per backend instance, ALL clients share it

**Why This Works (and is Required)**:
- **Sogni Socket Service**: Allows 1 connection per appId, but **supports unlimited concurrent projects per connection**
- **Sogni Client SDK**: Designed to handle unlimited concurrent projects per instance
- **Proven Scalability**: Global instance handles 16+ concurrent projects + browser extension + enhancements simultaneously
- **Resource Efficiency**: Single socket connection for entire backend
- **No Socket Conflicts**: 1 SDK instance = 1 socket connection = unlimited concurrent projects

### ❌ INCORRECT Pattern: Multiple SDK Instances

**Previous Attempts**: Browser Extension (Fixed)
```javascript
// WRONG: Creating multiple SDK instances (even with same appId)
const client1 = await createSogniClient(clientAppId); // First project
const client2 = await createSogniClient(clientAppId); // Second project - WRONG!

// Also WRONG: Unique client app IDs per project
const clientAppId1 = 'extension-project1-abc123';
const clientAppId2 = 'extension-project2-def456';

// Both cause: "Not recoverable socket error { code: 4015 }"
```

**Why This Fails**:
- **Sogni Socket Service**: Only allows 1 connection per appId globally
- **Multiple SDK instances**: Compete for same socket connection
- **Socket Conflicts**: Second connection kills first connection (error code 4015)
- **Authentication Races**: Concurrent SDK creation causes nonce conflicts
- **Resource Waste**: Multiple connections vs efficient single connection

---

## 🆔 Client App ID Management

### Naming Conventions
```javascript
// Main Frontend
const clientAppId = `photobooth-frontend-${Date.now()}`;

// Browser Extension  
const clientAppId = `photobooth-extension-${Date.now()}-${randomString}`;

// Enhancement Jobs
// Use same clientAppId as main project (not separate)
```

### Storage Strategy
```javascript
// Browser Extension: Persistent storage
chrome.storage.local.set({ 'sogni_extension_app_id': clientAppId });

// Frontend: Session-based (regenerated on refresh)
// Stored in component state/context
```

### Server-Side Mapping
```javascript
// server/services/sogni.js
const sessionAppClients = new Map(); // sessionId:clientAppId -> SDK instance
const activeConnections = new Map();  // clientAppId -> SDK instance

// Pattern: One SDK instance per unique clientAppId
export async function getSessionClient(sessionId, clientAppId) {
  const key = `${sessionId}:${clientAppId}`;
  if (sessionAppClients.has(key)) {
    return sessionAppClients.get(key); // Reuse existing SDK instance
  }
  
  // Create new dedicated SDK instance for this clientAppId
  const client = await createDedicatedClient(clientAppId);
  sessionAppClients.set(key, client.appId);
  return client;
}
```

---

## 📡 SSE Connection Strategies

### Client-Based SSE (Recommended for Concurrent Projects)
```javascript
// Single SSE connection for all projects from same client
const progressUrl = `/progress/client?clientAppId=${clientAppId}`;
const eventSource = new EventSource(progressUrl, { withCredentials: true });

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Route event to correct project based on data.projectId
  if (activeProjects.has(data.projectId)) {
    handleProjectEvent(data.projectId, data);
  }
};
```

**Use When**:
- Single client with multiple concurrent projects (main frontend, browser extension)
- Need efficient event routing for all projects
- Want to minimize SSE connections

### Session-Based SSE (For Multi-Client Sessions)
```javascript
// Session-wide SSE for multiple different clients
const progressUrl = `/progress/session`;
const eventSource = new EventSource(progressUrl, { withCredentials: true });
```

**Use When**:
- Multiple different clients in same session
- Need to handle events from various clientAppIds
- Complex routing scenarios

### Project-Based SSE (Legacy)
```javascript
// Individual SSE per project (not recommended for concurrent scenarios)
const progressUrl = `/progress/${projectId}`;
```

**Use When**:
- Single project scenarios only
- Legacy compatibility required

---

## 🌐 Browser Extension Architecture

### Correct Implementation Pattern
```javascript
// background.js - Single shared client app ID
let extensionClientAppId = 'photobooth-extension-stable-id';

// All concurrent projects use SAME client app ID
const project1 = await createProject(params1, extensionClientAppId);
const project2 = await createProject(params2, extensionClientAppId);

// Single client-based SSE connection
const sseManager = new SSEConnectionManager();
sseManager.connect(`/progress/client?clientAppId=${extensionClientAppId}`);
```

### Event Routing Pattern
```javascript
// content.js - Concurrent processing
async function processImagesBatch(images) {
  const chunks = [];
  for (let i = 0; i < images.length; i += MAX_CONCURRENT_CONVERSIONS) {
    chunks.push(images.slice(i, i + MAX_CONCURRENT_CONVERSIONS));
  }
  
  for (const chunk of chunks) {
    // Process chunk in parallel - all use same clientAppId
    const promises = chunk.map(img => convertImage(img));
    const results = await Promise.allSettled(promises);
  }
}
```

### Background Script Patterns
```javascript
// Shared SSE connection for all projects
class SSEConnectionManager {
  constructor() {
    this.activeProjects = new Map(); // projectId -> handlers
  }
  
  connect(apiBaseUrl) {
    const progressUrl = `${apiBaseUrl}/progress/client?clientAppId=${extensionClientAppId}`;
    this.eventSource = new EventSource(progressUrl, { withCredentials: true });
    
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.activeProjects.has(data.projectId)) {
        this.handleProjectEvent(data.projectId, data);
      }
    };
  }
}
```

---

## ⚠️ Common Pitfalls & Solutions

### Pitfall 1: Multiple Client App IDs for Concurrent Projects
**Problem**: Creating unique clientAppId per project causes socket conflicts
```javascript
// WRONG
const clientAppId1 = `extension-${Date.now()}-1`;
const clientAppId2 = `extension-${Date.now()}-2`;
```

**Solution**: Use single shared clientAppId
```javascript
// CORRECT
const sharedClientAppId = 'photobooth-extension-stable-id';
// All projects use sharedClientAppId
```

### Pitfall 2: Session-based SSE with Client-based Projects
**Problem**: Using session SSE with client-specific projects causes routing issues
```javascript
// WRONG: Session SSE with client-specific projects
const sseUrl = '/progress/session'; // Session-based
const projectRequest = { clientAppId: 'specific-client' }; // Client-specific
```

**Solution**: Match SSE strategy with project strategy
```javascript
// CORRECT: Client SSE with client-specific projects
const sseUrl = `/progress/client?clientAppId=${clientAppId}`;
const projectRequest = { clientAppId }; // Same clientAppId
```

### Pitfall 3: Not Handling Enhancement Job Concurrency
**Problem**: Canceling main projects when enhancement jobs start
```javascript
// WRONG: Cancel all projects for enhancement
if (this.activeProjects.size > 0) {
  this.activeProjects.clear(); // Cancels enhancement jobs too
}
```

**Solution**: Allow enhancement jobs to run concurrently
```javascript
// CORRECT: Only cancel non-enhancement projects
const isEnhancement = params.sourceType === 'enhancement';
if (this.activeProjects.size > 0 && !isEnhancement) {
  // Only cancel main generation projects, not enhancements
  this.cancelNonEnhancementProjects();
}
```

### Pitfall 4: Event Handler Strategy Mismatch
**Problem**: Using wrong event handler pattern for different client types
```javascript
// Main Frontend: Uses global handlers (works with single 16-image project)
sogniClient.projects.on('job', globalJobHandler);

// Browser Extension: Needs per-project handlers (multiple separate 1-image projects)
// BUT: When sharing same SDK instance, handlers can conflict
```

**Solution**: Use appropriate SSE strategy for client type
```javascript
// Main Frontend: Client-based SSE + Global handlers (for single multi-image projects)
const sseUrl = `/progress/client?clientAppId=${clientAppId}`;

// Browser Extension: Session-based SSE + Per-project handlers (for multiple single-image projects)
const sseUrl = `/progress/session`;
```

### Pitfall 5: Concurrent SDK Instance Creation
**Problem**: Creating multiple SDK instances with same appId simultaneously causes nonce race conditions
```javascript
// WRONG: Concurrent requests create multiple SDK instances
const client1 = await createDedicatedClient('same-app-id'); // First request
const client2 = await createDedicatedClient('same-app-id'); // Concurrent request
// Results in: "Invalid nonce" errors
```

**Solution**: Prevent concurrent creation of same appId
```javascript
// CORRECT: Use creation promise to serialize SDK instance creation
const clientCreationPromises = new Map();
if (clientCreationPromises.has(appId)) {
  return await clientCreationPromises.get(appId); // Wait for existing creation
}
// Only create new instance if none exists
```

### Pitfall 5: Incorrect Event Handler Selection
**Problem**: Using wrong event handlers for extension clients
```javascript
// server/services/sogni.js - WRONG
if (progressCallback && !isExtensionClient) {
  // Only attach handlers for non-extension clients
  attachGlobalHandlers();
}
```

**Solution**: Use appropriate handlers for client type
```javascript
// CORRECT: Use extension-specific handlers for extension clients
if (progressCallback && isExtensionClient) {
  attachExtensionHandlers(); // Per-project handlers + global fallback
} else if (progressCallback) {
  attachGlobalHandlers(); // Global handlers for main frontend
}
```

---

## 🐛 Debugging Guidelines

### Essential Debug Information
When debugging concurrent issues, always log:
```javascript
console.log('[CONCURRENT-DEBUG] Operation details:', {
  clientAppId,
  projectId,
  activeProjects: Array.from(activeProjects.keys()),
  sseConnectionType: 'client|session|project',
  totalActiveConnections: activeConnections.size
});
```

### Server-Side Debug Patterns
```javascript
// Log SDK instance creation
console.log(`[SESSION] Creating new per-app client for ${sessionId}:${clientAppId}`);

// Log project mapping
console.log(`[IMAGE][MAP]`, {
  sdkProjectId: project.id,
  localProjectId,
  isExtensionClient: !!(params.clientAppId?.startsWith('photobooth-extension-')),
  clientAppId: params.clientAppId
});

// Log event routing
console.log(`[${localProjectId}] Forwarded '${event.type}' event to ${totalClients} SSE client(s)`);
```

### Client-Side Debug Patterns
```javascript
// Log SSE connection details
console.log('Background: Connecting to CLIENT SSE stream (single SDK instance, multiple projects):', progressUrl);

// Log project tracking
console.log('Background: [CONCURRENT-DEBUG] Tracking new project', {
  projectId,
  totalActive: activeProjects.size + 1,
  allActiveProjects: [...activeProjects.keys(), projectId]
});
```

### Error Patterns to Watch For
```javascript
// Socket connection conflicts (multiple SDK instances with same appId)
"Not recoverable socket error { code: 4015, reason: 'Switching to new connection from app-id' }"

// WebSocket disconnections (result of socket conflicts)
"ERROR - WebSocket not connected"

// Authentication nonce race conditions (concurrent SDK creation)
"Invalid nonce" / "ApiError: Invalid nonce" / "errorCode: 103"

// 🚨 COMMON MISDIAGNOSIS: "SDK processes projects sequentially"
// WRONG CONCLUSION: "Only one project processes at a time, SDK is sequential"
// ACTUAL ISSUE: Project submission timing or resource allocation problems
// EVIDENCE: Main frontend successfully runs 16+ concurrent projects

// Event handler conflicts (per-project handlers on shared SDK instance)
"Only one project receives events while others are stuck"
"[IMAGE][EXT] attaching per-project handlers" (indicates conflicting handlers)

// Event routing failures  
"[projectId] No SSE clients found - storing event for later pickup"
```

---

## 🚀 Future Development Guidelines

### When Adding New Clients
1. **🔥 CRITICAL: Single Global SDK Instance**: Each client application must use ONE SDK instance for ALL operations
2. **Use Single Client App ID**: Each new client type should use one stable clientAppId  
3. **Choose Correct SSE Strategy**: Use client-based SSE for concurrent projects
4. **Follow Naming Conventions**: `{component}-{type}-{timestamp}`
5. **Add Debug Logging**: Include `[CONCURRENT-DEBUG]` tags for concurrent operations
6. **Never Create Multiple SDK Instances**: Always reuse existing SDK instance for same clientAppId

### When Modifying Concurrent Logic
1. **Test with Main Frontend Pattern**: Ensure changes don't break 16-image + enhancement concurrency
2. **Verify Extension Compatibility**: Test browser extension concurrent handling
3. **Check Event Routing**: Ensure SSE events reach correct project handlers
4. **Monitor Server Resources**: Watch for SDK instance proliferation

### When Adding New Project Types
1. **Reuse Existing Client App ID**: Don't create new clientAppId per project type
2. **Consider Enhancement Pattern**: Use `sourceType: 'enhancement'` for concurrent jobs
3. **Update Event Handlers**: Ensure new project types work with existing SSE routing
4. **Document Concurrency Behavior**: Update this guide with new patterns

### Performance Considerations
1. **🔥 SDK Instance Limits**: **NEVER exceed one SDK instance per clientAppId** - this is a hard constraint
2. **Global Instance Reuse**: Always reuse existing SDK instances instead of creating new ones
3. **SSE Connection Limits**: Minimize SSE connections (prefer client-based over project-based)
4. **Event Volume**: Consider event throttling for high-frequency progress updates
5. **Memory Management**: Implement proper cleanup for completed projects
6. **Socket Connection Monitoring**: Watch for `code: 4015` errors indicating multiple instances

### Testing Concurrent Scenarios
Always test these scenarios when making changes:
1. **Main Frontend**: 16-image batch + concurrent enhancement job
2. **Browser Extension**: 4+ concurrent profile image conversions  
3. **Mixed Clients**: Frontend + extension running simultaneously
4. **Error Recovery**: Network disconnections, server restarts, token refresh

---

## 📚 Reference Implementation Examples

### Main Frontend Concurrent Pattern
```javascript
// src/App.jsx - Proven working pattern
const sogniClient = await initializeSogniClient(); // Single client instance
const project = await sogniClient.projects.create(projectConfig); // 16 images
const enhanceProject = await sogniClient.projects.create(enhanceConfig); // Concurrent enhancement
```

### Browser Extension Concurrent Pattern  
```javascript
// browser-extension/background.js - Fixed implementation
const extensionClientAppId = 'photobooth-extension-stable-id';
const sseManager = new SSEConnectionManager();
sseManager.connect(`/progress/client?clientAppId=${extensionClientAppId}`);

// Multiple concurrent projects
const promises = images.map(img => createProject(img, extensionClientAppId));
const results = await Promise.allSettled(promises);
```

### Server-Side SDK Management
```javascript
// server/services/sogni.js - Core pattern
export async function getSessionClient(sessionId, clientAppId) {
  const key = `${sessionId}:${clientAppId}`;
  if (sessionAppClients.has(key)) {
    return sessionAppClients.get(key); // Reuse SDK instance
  }
  
  const client = await createDedicatedClient(clientAppId); // One SDK per clientAppId
  sessionAppClients.set(key, client.appId);
  return client;
}
```

---

## 🔄 Maintenance & Updates

This document should be updated whenever:
- New client types are added (mobile app, desktop app, etc.)
- Concurrent processing patterns change
- New Sogni SDK features are integrated
- Performance optimizations are implemented
- Bug fixes reveal architectural insights

**Last Updated**: January 2025
**Next Review**: When adding new concurrent processing features

---

## 📞 Quick Reference

### Key Files
- `server/services/sogni.js` - SDK instance management
- `server/routes/sogni.js` - SSE endpoint routing
- `src/services/sogniBackend.ts` - Frontend client interface
- `browser-extension/background.js` - Extension SSE management

### Debug Commands
```bash
# Check active SDK connections
grep -r "Active connections:" server/logs/

# Monitor SSE events
grep -r "Forwarded.*event" server/logs/

# Track concurrent projects
grep -r "CONCURRENT-DEBUG" browser-extension/
```

### Environment Variables
```bash
SOGNI_ENV=local|staging|production
SOGNI_USERNAME=your-username
SOGNI_PASSWORD=your-password
```

---

*This document serves as the authoritative guide for Sogni Photobooth architecture. All AI assistants and developers should reference this before making concurrent processing changes.*
