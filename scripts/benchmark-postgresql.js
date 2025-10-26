const axios = require('axios');

/**
 * Week 1 Benchmarking Script
 * 
 * This script tests the performance of the naive proximity search
 * to establish a baseline for Week 2 optimization.
 */

const BASE_URL = 'http://localhost:3000/api';
const TEST_COORDINATES = [
  { lat: 40.7128, lng: -74.0060, name: 'NYC Center' },
  { lat: 40.7589, lng: -73.9851, name: 'Times Square' },
  { lat: 40.6892, lng: -74.0445, name: 'Statue of Liberty' },
  { lat: 40.7505, lng: -73.9934, name: 'Empire State Building' },
  { lat: 40.7614, lng: -73.9776, name: 'Central Park' }
];

async function benchmarkProximitySearch() {
  console.log(' Starting Week 1 proximity search benchmark...');
  
  const results = [];
  
  for (const coord of TEST_COORDINATES) {
    console.log(`\n📍 Testing ${coord.name} (${coord.lat}, ${coord.lng})`);
    
    const times = [];
    const successfulRequests = [];
    
    // Run 10 requests to get average performance
    for (let i = 0; i < 10; i++) {
      try {
        const startTime = Date.now();
        
        const response = await axios.get(`${BASE_URL}/drivers/nearby`, {
          params: {
            lat: coord.lat,
            lng: coord.lng,
            radius: 5
          },
          timeout: 10000
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        times.push(responseTime);
        successfulRequests.push({
          responseTime,
          driversFound: response.data.data.length,
          queryTime: response.data.performance?.queryTime || 'N/A'
        });
        
        console.log(`  Request ${i + 1}: ${responseTime}ms (${response.data.data.length} drivers found)`);
        
      } catch (error) {
        console.error(`  Request ${i + 1} failed:`, error.message);
      }
    }
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
      
      results.push({
        location: coord.name,
        coordinates: coord,
        avgTime: Math.round(avgTime),
        minTime,
        maxTime,
        p95Time,
        successfulRequests: times.length,
        totalRequests: 10
      });
      
      console.log(`   Average: ${Math.round(avgTime)}ms, Min: ${minTime}ms, Max: ${maxTime}ms, P95: ${p95Time}ms`);
    }
  }
  
  return results;
}

async function runBenchmark() {
  try {
    // Check if API is running
    await axios.get(`${BASE_URL}/health`);
    console.log(' API is running and ready for testing');
    
    // Run benchmark
    const results = await benchmarkProximitySearch();
    
    // Calculate overall statistics
    const allTimes = results.flatMap(r => 
      Array(r.successfulRequests).fill(r.avgTime)
    );
    
    const overallAvg = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
    const overallP95 = allTimes.sort((a, b) => a - b)[Math.floor(allTimes.length * 0.95)];
    
    console.log(`
 Week 1 Benchmark Results
============================

 Overall Performance (Naive SQL):
  • Average latency: ${Math.round(overallAvg)}ms
  • P95 latency: ${overallP95}ms
  • Total successful requests: ${results.reduce((sum, r) => sum + r.successfulRequests, 0)}
  • Success rate: ${Math.round((results.reduce((sum, r) => sum + r.successfulRequests, 0) / (results.length * 10)) * 100)}%

📍 Location-specific results:
${results.map(r => 
  `  • ${r.location}: ${r.avgTime}ms avg, ${r.p95Time}ms p95`
).join('\n')}

🚨 Performance Issues Identified:
  • High latency (${Math.round(overallAvg)}ms average)
  • Inconsistent performance (${Math.min(...results.map(r => r.minTime))}ms - ${Math.max(...results.map(r => r.maxTime))}ms range)
  • P95 latency too high (${overallP95}ms)

 Week 2 Optimization Targets:
  • Target average latency: < 50ms
  • Target P95 latency: < 100ms
  • Target improvement: 10x faster

 Next Steps:
  1. Understand why this is slow (Haversine formula on every row)
  2. Learn about geospatial indexing
  3. Implement Redis Geo in Week 2
  4. Compare performance improvements

 Key Learning:
  This establishes our baseline. In Week 2, we'll use Redis Geo
  to achieve sub-50ms queries - a 10x+ improvement!
    `);
    
  } catch (error) {
    console.error(' Benchmark failed:', error.message);
    console.log(' Make sure the API is running: npm start');
    process.exit(1);
  }
}

// Run benchmark if this file is executed directly
if (require.main === module) {
  runBenchmark();
}

module.exports = { benchmarkProximitySearch, runBenchmark };
