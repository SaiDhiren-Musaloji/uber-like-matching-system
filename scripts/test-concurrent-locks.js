const axios = require('axios');
const { performance } = require('perf_hooks');

/**
 * Week 3 Concurrent Testing Script
 * 
 * This script tests the distributed locking functionality by making
 * concurrent requests to demonstrate race condition prevention.
 */

const BASE_URL = 'http://localhost:3000';
const CONCURRENT_REQUESTS = 10;
const REQUEST_DELAY_MS = 100;

// Sample booking data
const sampleBooking = {
  rider_id: 1,
  pickup_lat: 40.7128,
  pickup_lng: -74.0060,
  dropoff_lat: 40.7589,
  dropoff_lng: -73.9851,
  estimated_fare: 15.50,
  vehicle_type: 'standard'
};

/**
 * Create a booking request
 */
const createBooking = async (requestId) => {
  const startTime = performance.now();
  
  try {
    const response = await axios.post(`${BASE_URL}/api/bookings`, sampleBooking, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': `req-${requestId}`
      }
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
      success: true,
      requestId,
      bookingId: response.data.data.id,
      duration: Math.round(duration),
      status: response.data.data.status,
      message: response.data.message
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
      success: false,
      requestId,
      duration: Math.round(duration),
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
};

/**
 * Assign driver to a booking
 */
const assignDriver = async (bookingId, requestId) => {
  const startTime = performance.now();
  
  try {
    const response = await axios.post(`${BASE_URL}/api/bookings/${bookingId}/assign`, {}, {
      timeout: 10000,
      headers: {
        'X-Request-ID': `assign-${requestId}`
      }
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
      success: true,
      requestId,
      bookingId,
      driverId: response.data.data.driver?.id,
      duration: Math.round(duration),
      message: response.data.message
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
      success: false,
      requestId,
      bookingId,
      duration: Math.round(duration),
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
};

/**
 * Test concurrent booking creation
 */
const testConcurrentBookings = async () => {
  console.log(' Testing concurrent booking creation...\n');
  
  const promises = [];
  const startTime = performance.now();
  
  // Create multiple concurrent booking requests
  for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
    promises.push(createBooking(i));
    
    // Small delay between requests to simulate real-world scenario
    if (i < CONCURRENT_REQUESTS) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }
  
  console.log(`📤 Sent ${CONCURRENT_REQUESTS} concurrent booking requests...`);
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  const endTime = performance.now();
  const totalDuration = Math.round(endTime - startTime);
  
  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log('\n Results:');
  console.log(`  • Total requests: ${results.length}`);
  console.log(`  • Successful: ${successful.length}`);
  console.log(`  • Failed: ${failed.length}`);
  console.log(`  • Total duration: ${totalDuration}ms`);
  console.log(`  • Average duration: ${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)}ms`);
  
  if (successful.length > 0) {
    console.log('\n Successful bookings:');
    successful.forEach(result => {
      console.log(`  • Request ${result.requestId}: Booking ID ${result.bookingId} (${result.duration}ms)`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n Failed requests:');
    failed.forEach(result => {
      console.log(`  • Request ${result.requestId}: ${result.error} (${result.duration}ms)`);
    });
  }
  
  return successful;
};

/**
 * Test concurrent driver assignment
 */
const testConcurrentDriverAssignment = async (bookingIds) => {
  if (bookingIds.length === 0) {
    console.log('\n No bookings available for driver assignment test');
    return;
  }
  
  console.log('\n Testing concurrent driver assignment...\n');
  
  const promises = [];
  const startTime = performance.now();
  
  // Try to assign drivers to the same booking concurrently
  const targetBookingId = bookingIds[0];
  
  for (let i = 1; i <= Math.min(CONCURRENT_REQUESTS, 5); i++) {
    promises.push(assignDriver(targetBookingId, i));
    
    // Small delay between requests
    if (i < Math.min(CONCURRENT_REQUESTS, 5)) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }
  
  console.log(`📤 Sent ${Math.min(CONCURRENT_REQUESTS, 5)} concurrent driver assignment requests for booking ${targetBookingId}...`);
  
  // Wait for all requests to complete
  const results = await Promise.all(promises);
  const endTime = performance.now();
  const totalDuration = Math.round(endTime - startTime);
  
  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log('\n Results:');
  console.log(`  • Total requests: ${results.length}`);
  console.log(`  • Successful: ${successful.length}`);
  console.log(`  • Failed: ${failed.length}`);
  console.log(`  • Total duration: ${totalDuration}ms`);
  
  if (successful.length > 0) {
    console.log('\n Successful assignments:');
    successful.forEach(result => {
      console.log(`  • Request ${result.requestId}: Driver ID ${result.driverId} (${result.duration}ms)`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n Failed assignments:');
    failed.forEach(result => {
      console.log(`  • Request ${result.requestId}: ${result.error} (${result.duration}ms)`);
    });
  }
  
  // Verify only one driver was assigned
  if (successful.length === 1) {
    console.log('\n  Distributed locking working correctly - only one driver assigned!');
  } else if (successful.length > 1) {
    console.log('\n  Potential race condition - multiple drivers assigned!');
  } else {
    console.log('\n No drivers were assigned');
  }
};

/**
 * Test lock statistics
 */
const testLockStatistics = async () => {
  try {
    console.log('\n Checking lock statistics...');
    
    const response = await axios.get(`${BASE_URL}/api/locks/stats`);
    
    if (response.data.success) {
      const stats = response.data.data;
      console.log(`  • Total active locks: ${stats.totalLocks}`);
      
      if (stats.locks.length > 0) {
        console.log('  • Active locks:');
        stats.locks.forEach(lock => {
          console.log(`    - ${lock.resource}: TTL ${lock.ttl}s`);
        });
      } else {
        console.log('  • No active locks');
      }
    } else {
      console.log('   Failed to get lock statistics');
    }
  } catch (error) {
    console.log('   Error getting lock statistics:', error.message);
  }
};

/**
 * Main test function
 */
const runConcurrentTests = async () => {
  try {
    console.log(' Week 3 Concurrent Testing Started\n');
    console.log('=' .repeat(50));
    
    // Check if server is running
    try {
      await axios.get(`${BASE_URL}/api/health`);
      console.log(' Server is running\n');
    } catch (error) {
      console.log(' Server is not running. Please start it with: npm run start-week3\n');
      return;
    }
    
    // Test 1: Concurrent booking creation
    const successfulBookings = await testConcurrentBookings();
    
    // Test 2: Concurrent driver assignment
    if (successfulBookings.length > 0) {
      const bookingIds = successfulBookings.map(b => b.bookingId);
      await testConcurrentDriverAssignment(bookingIds);
    }
    
    // Test 3: Lock statistics
    await testLockStatistics();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Concurrent testing completed!');
    console.log('\n Key takeaways:');
    console.log('  • Distributed locking prevents race conditions');
    console.log('  • Only one driver can be assigned to a booking');
    console.log('  • Failed requests indicate proper locking behavior');
    console.log('  • Lock statistics help monitor system health');
    
  } catch (error) {
    console.error(' Test failed:', error.message);
  }
};

// Run tests if this script is executed directly
if (require.main === module) {
  runConcurrentTests()
    .then(() => {
      console.log('\n Testing completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n Testing failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testConcurrentBookings,
  testConcurrentDriverAssignment,
  testLockStatistics,
  runConcurrentTests
};
