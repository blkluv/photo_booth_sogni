#!/bin/bash

# Navigate to correct directory for relative imports
cd "$(dirname "$0")/.."

# Function to run a test and check exit code
run_test() {
  local test_name="$1"
  local test_cmd="$2"
  
  echo "Running $test_name..."
  eval "$test_cmd"
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    echo "✅ $test_name completed successfully!"
    return 0
  else
    echo "❌ $test_name failed with exit code $exit_code"
    return 1
  fi
}

# Test with the mock implementation first
run_test "Mock connection cleanup test" "node scripts/util/mock-connection-test.js"
mock_test_result=$?

# Test the mock idle timeout functionality
run_test "Mock idle timeout test" "node scripts/util/mock-idle-timeout-test.js"
mock_idle_test_result=$?

if [ $mock_test_result -eq 0 ] && [ $mock_idle_test_result -eq 0 ]; then
  echo -e "\n✅ Both mock tests passed! This confirms our connection cleanup logic is sound."
  
  # Only run real tests if environment variable is set
  if [ -n "$RUN_REAL_TESTS" ]; then
    echo -e "\nRunning tests with real Sogni client (requires proper credentials)..."
    
    # Test the socket connection tracking
    run_test "Sogni client connection tracking test" "NODE_OPTIONS=\"--experimental-vm-modules\" node scripts/util/socket-cleanup-test.js"
    socket_test_result=$?

    # Skip remaining tests if the socket test failed
    if [ $socket_test_result -ne 0 ]; then
      echo "Skipping remaining tests due to socket test failure"
      exit 1
    fi

    # Test the idle timeout mechanism with a shorter timeout for testing
    run_test "Sogni client idle timeout test" "REDUCED_TIMEOUT=\"true\" NODE_OPTIONS=\"--experimental-vm-modules\" node scripts/util/test-idle-timeout.js"
    idle_test_result=$?

    # Final result is success only if all tests passed
    if [ $socket_test_result -eq 0 ] && [ $idle_test_result -eq 0 ]; then
      echo -e "\n✅ All tests passed! The Sogni client connection handling is working correctly."
      exit 0
    else
      echo -e "\n❌ Some real tests failed. Please check the logs for details."
      exit 1
    fi
  else
    echo -e "\nSkipping real Sogni client tests. Set RUN_REAL_TESTS=1 to run them."
    exit 0
  fi
else
  if [ $mock_test_result -ne 0 ]; then
    echo -e "\n❌ Mock connection test failed. Please fix the connection cleanup logic."
  fi
  
  if [ $mock_idle_test_result -ne 0 ]; then
    echo -e "\n❌ Mock idle timeout test failed. Please fix the timeout logic."
  fi
  
  exit 1
fi 