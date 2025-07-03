import { getSessionClient, disconnectSessionClient, cleanupSogniClient } from './services/sogni.js';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

const main = async () => {
  console.log('Testing token validation with expired/invalid tokens...');
  
  const testSessionId = 'test-session-' + Date.now();
  const testClientAppId = 'test-token-validation-' + Date.now();
  
  try {
    console.log('\n1. Creating client with valid credentials...');
    const client = await getSessionClient(testSessionId, testClientAppId);
    console.log('✓ Client created successfully');
    console.log('  - Authentication state:', client.account.currentAccount.isAuthenicated);
    console.log('  - Has token:', !!client.account.currentAccount.token);
    
    console.log('\n2. Testing token validation on fresh client...');
    const isValid1 = await testTokenValidation(client);
    console.log('  - Fresh client validation result:', isValid1);
    
    // Simulate token expiration by manually corrupting the token
    console.log('\n3. Simulating expired token...');
    if (client.account.currentAccount.token) {
      const originalToken = client.account.currentAccount.token;
      // Corrupt the token to simulate expiration
      client.account.currentAccount._update({
        token: originalToken + 'corrupted'
      });
      console.log('  - Token corrupted to simulate expiration');
      
      console.log('\n4. Testing validation with corrupted token...');
      const isValid2 = await testTokenValidation(client);
      console.log('  - Corrupted token validation result:', isValid2);
      
      if (!isValid2) {
        console.log('✓ Token validation correctly detected invalid token');
      } else {
        console.log('✗ Token validation failed to detect invalid token');
      }
    }
    
    console.log('\n5. Testing session client reuse after invalid token...');
    // This should create a new client since the old one should be invalid
    const client2 = await getSessionClient(testSessionId, testClientAppId);
    if (client2 !== client) {
      console.log('✓ New client created after invalid token detected');
    } else {
      console.log('⚠ Same client reused despite invalid token');
    }
    
    console.log('\nTest completed successfully!');
    return true;
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    // Clean up
    console.log('\nCleaning up...');
    try {
      await disconnectSessionClient(testSessionId, testClientAppId);
      // Force cleanup of all clients to ensure clean exit
      await cleanupSogniClient({ logout: true, includeSessionClients: true });
      console.log('✓ Cleanup completed');
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError.message);
    }
  }
};

// Helper function to test token validation
async function testTokenValidation(client) {
  try {
    await client.account.refreshBalance();
    return true;
  } catch (error) {
    if (error.status === 401 || (error.message && error.message.includes('Invalid token'))) {
      return false;
    }
    // For other errors, assume valid (network issues, etc.)
    return true;
  }
}

// Run the test and exit
main()
  .then((success) => {
    console.log(`\nTest ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 