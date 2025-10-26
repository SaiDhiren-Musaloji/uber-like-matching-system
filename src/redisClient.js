const { createClient } = require('redis');
require('dotenv').config();

/**
 * Redis Client for Geospatial Operations
 * 
 * This module provides Redis GEO operations for fast proximity search.
 * It implements geospatial indexing using Redis GEO commands.
 */

let redisClient = null;

// Create Redis client
const initializeRedis = async () => {
  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(' Redis connection failed after 10 attempts');
            return false;
          }
          return retries * 100;
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error(' Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log(' Connecting to Redis...');
    });

    redisClient.on('ready', () => {
      console.log(' Connected to Redis');
    });

    redisClient.on('end', () => {
      console.log(' Redis connection ended');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error(' Failed to initialize Redis:', error);
    throw error;
  }
};

// Get Redis client instance
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

// Check if Redis is connected
const isRedisConnected = () => {
  return redisClient && redisClient.isReady;
};

// Add driver location to Redis GEO
const addDriverLocation = async (driverId, lat, lng) => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    const member = `driver:${driverId}`;
    
    // GEOADD: Add geospatial data to Redis
    const added = await client.geoAdd(key, {
      longitude: parseFloat(lng),
      latitude: parseFloat(lat),
      member: member
    });
    
    return added > 0;
  } catch (error) {
    console.error('Error adding driver location to Redis:', error);
    throw error;
  }
};

// Find nearby drivers using Redis GEOSEARCH
const findNearbyDrivers = async (lat, lng, radiusKm = 5, limit = 10) => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    
    // GEOSEARCH: Find nearby drivers using Redis GEOSEARCH command
    // Format: GEOSEARCH key FROMLONLAT longitude latitude BYRADIUS radius unit COUNT count WITHCOORD WITHDIST
    const results = await client.sendCommand([
      'GEOSEARCH',
      key,
      'FROMLONLAT',
      lng.toString(),
      lat.toString(),
      'BYRADIUS',
      radiusKm.toString(),
      'km',
      'COUNT',
      limit.toString(),
      'WITHCOORD',
      'WITHDIST'
    ]);
    
    // Parse results into a more usable format
    // Redis returns: [member1, distance1, lng1, lat1, member2, distance2, lng2, lat2, ...]
    const drivers = [];
    for (let i = 0; i < results.length; i += 4) {
      const driverId = String(results[i]);
      const distance = parseFloat(results[i + 1]);
      const lng = parseFloat(results[i + 2]);
      const lat = parseFloat(results[i + 3]);
      
      const actualId = driverId.replace('driver:', '');
      
      drivers.push({
        id: parseInt(actualId),
        driverId: driverId,
        distance: parseFloat(distance.toFixed(2)),
        coordinates: {
          lng: lng,
          lat: lat
        }
      });
    }
    
    return drivers;
  } catch (error) {
    console.error('Error finding nearby drivers in Redis:', error);
    throw error;
  }
};

// Remove driver location from Redis
const removeDriverLocation = async (driverId) => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    const member = `driver:${driverId}`;
    
    await client.zRem(key, member);
    return true;
  } catch (error) {
    console.error('Error removing driver location from Redis:', error);
    throw error;
  }
};

// Get driver location from Redis
const getDriverLocation = async (driverId) => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    const member = `driver:${driverId}`;
    
    const coordinates = await client.geoPos(key, member);
    
    if (!coordinates || !coordinates[0]) {
      return null;
    }
    
    const [lng, lat] = coordinates[0];
    return {
      lat: parseFloat(lat.toFixed(8)),
      lng: parseFloat(lng.toFixed(8))
    };
  } catch (error) {
    console.error('Error getting driver location from Redis:', error);
    throw error;
  }
};

// Get count of drivers in Redis
const getDriverCount = async () => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    
    return await client.zCard(key);
  } catch (error) {
    console.error('Error getting driver count from Redis:', error);
    throw error;
  }
};

// Clear all driver locations from Redis
const clearAllDrivers = async () => {
  try {
    const client = getRedisClient();
    const key = 'drivers';
    
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Error clearing drivers from Redis:', error);
    throw error;
  }
};

// Close Redis connection
const closeRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      console.log(' Redis connection closed');
    }
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
};

module.exports = {
  initializeRedis,
  getRedisClient,
  isRedisConnected,
  addDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getDriverLocation,
  getDriverCount,
  clearAllDrivers,
  closeRedis
};
