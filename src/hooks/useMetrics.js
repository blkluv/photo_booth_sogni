import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to fetch metrics from the server
 * @returns {Object} Metrics data and loading state
 */
const useMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const fetchMetrics = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get base URL from window location
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/api/metrics${forceRefresh ? '?t=' + Date.now() : ''}`;
      
      console.log(`[Metrics] Fetching from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        credentials: 'include', // Include cookies
      });

      console.log(`[Metrics] Response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status} ${response.statusText}`);
      }

      // Check content type to ensure it's JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`[Metrics] Unexpected content type: ${contentType}`);
        throw new Error(`Expected JSON but got ${contentType}`);
      }

      const data = await response.json();
      console.log(`[Metrics] Data received:`, data);
      setMetrics(data);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('[Metrics] Error fetching metrics:', err);
      // Provide fallback metrics rather than showing nothing
      setMetrics({
        today: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        lifetime: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        date: new Date().toISOString().split('T')[0],
        source: 'fallback-client'
      });
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manual refresh function that can be called from the component
  const refreshMetrics = () => {
    fetchMetrics(true);
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchMetrics();

    // Optional: Set up polling to refresh metrics
    const intervalId = setInterval(() => fetchMetrics(), 30000); // Refresh every 30 seconds

    return () => {
      clearInterval(intervalId); // Cleanup interval on unmount
    };
  }, [fetchMetrics]);

  return { metrics, isLoading, error, lastRefresh, refreshMetrics };
};

export default useMetrics; 