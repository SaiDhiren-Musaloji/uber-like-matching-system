const { createClient } = require('redis');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Distributed Lock Service (Week 3)
 * 
 * This module provides Redis-based distributed locking to prevent race conditions
 * and ensure atomic operations in a distributed system.
 */

let redisClient = null;

// Initialize Redis client (reuse existing connection)
const initializeRedis = async () => {
  try {
    if (!redisClient) {
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
        console.error(' Redis Lock Service Error:', err);
      });

      await redisClient.connect();
    }
    return redisClient;
  } catch (error) {
    console.error(' Failed to initialize Redis for locking:', error);
    throw error;
  }
};

// Generate unique lock identifier
const generateLockId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Acquire a distributed lock
 * @param {string} resource - The resource to lock (e.g., 'driver:123')
 * @param {number} ttlSeconds - Lock time-to-live in seconds (default: 30)
 * @param {number} retryAttempts - Number of retry attempts (default: 3)
 * @param {number} retryDelayMs - Delay between retries in milliseconds (default: 100)
 * @returns {Promise<{success: boolean, lockId: string|null, error?: string}>}
 */
const acquireLock = async (resource, ttlSeconds = 30, retryAttempts = 3, retryDelayMs = 100) => {
  try {
    const client = redisClient || await initializeRedis();
    const lockKey = `lock:${resource}`;
    const lockId = generateLockId();
    
    let attempts = 0;
    
    while (attempts < retryAttempts) {
      try {
        // Try to acquire lock using SET with NX (not exists) and EX (expiration)
        const result = await client.set(lockKey, lockId, {
          EX: ttlSeconds,
          NX: true
        });
        
        if (result === 'OK') {
          console.log(` Lock acquired: ${resource} (ID: ${lockId})`);
          return {
            success: true,
            lockId: lockId,
            resource: resource,
            ttl: ttlSeconds
          };
        }
        
        attempts++;
        if (attempts < retryAttempts) {
          console.log(`⏳ Lock acquisition failed, retrying... (${attempts}/${retryAttempts})`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempts));
        }
      } catch (error) {
        console.error(` Error acquiring lock for ${resource}:`, error);
        attempts++;
        if (attempts < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempts));
        }
      }
    }
    
    return {
      success: false,
      lockId: null,
      error: `Failed to acquire lock after ${retryAttempts} attempts`
    };
    
  } catch (error) {
    console.error(' Critical error in acquireLock:', error);
    return {
      success: false,
      lockId: null,
      error: error.message
    };
  }
};

/**
 * Release a distributed lock
 * @param {string} resource - The resource that was locked
 * @param {string} lockId - The lock ID returned by acquireLock
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const releaseLock = async (resource, lockId) => {
  try {
    const client = redisClient || await initializeRedis();
    const lockKey = `lock:${resource}`;
    
    // Use Lua script to ensure atomic check-and-delete
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await client.eval(luaScript, {
      keys: [lockKey],
      arguments: [lockId]
    });
    
    if (result === 1) {
      console.log(`🔓 Lock released: ${resource} (ID: ${lockId})`);
      return { success: true };
    } else {
      console.log(` Lock not released: ${resource} (ID: ${lockId}) - lock may have expired or been released by another process`);
      return { 
        success: false, 
        error: 'Lock not found or already released' 
      };
    }
    
  } catch (error) {
    console.error(' Error releasing lock:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Extend a lock's TTL
 * @param {string} resource - The resource that is locked
 * @param {string} lockId - The lock ID
 * @param {number} additionalSeconds - Additional seconds to add to TTL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const extendLock = async (resource, lockId, additionalSeconds = 30) => {
  try {
    const client = redisClient || await initializeRedis();
    const lockKey = `lock:${resource}`;
    
    // Use Lua script to check ownership and extend TTL
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    const result = await client.eval(luaScript, {
      keys: [lockKey],
      arguments: [lockId, additionalSeconds.toString()]
    });
    
    if (result === 1) {
      console.log(`⏰ Lock extended: ${resource} (ID: ${lockId}) by ${additionalSeconds}s`);
      return { success: true };
    } else {
      return { 
        success: false, 
        error: 'Lock not found or not owned by this process' 
      };
    }
    
  } catch (error) {
    console.error(' Error extending lock:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if a resource is currently locked
 * @param {string} resource - The resource to check
 * @returns {Promise<{locked: boolean, lockId?: string, ttl?: number}>}
 */
const isLocked = async (resource) => {
  try {
    const client = redisClient || await initializeRedis();
    const lockKey = `lock:${resource}`;
    
    const lockId = await client.get(lockKey);
    const ttl = await client.ttl(lockKey);
    
    if (lockId) {
      return {
        locked: true,
        lockId: lockId,
        ttl: ttl
      };
    } else {
      return {
        locked: false
      };
    }
    
  } catch (error) {
    console.error(' Error checking lock status:', error);
    return {
      locked: false,
      error: error.message
    };
  }
};

/**
 * Execute a function with a distributed lock
 * @param {string} resource - The resource to lock
 * @param {Function} fn - The function to execute while holding the lock
 * @param {Object} options - Lock options
 * @returns {Promise<any>}
 */
const withLock = async (resource, fn, options = {}) => {
  const {
    ttlSeconds = 30,
    retryAttempts = 3,
    retryDelayMs = 100,
    extendOnLongOperation = true
  } = options;
  
  const lockResult = await acquireLock(resource, ttlSeconds, retryAttempts, retryDelayMs);
  
  if (!lockResult.success) {
    throw new Error(`Failed to acquire lock for ${resource}: ${lockResult.error}`);
  }
  
  const { lockId } = lockResult;
  
  try {
    // Execute the function
    const result = await fn();
    
    // Release the lock
    await releaseLock(resource, lockId);
    
    return result;
    
  } catch (error) {
    // Always release lock on error
    await releaseLock(resource, lockId);
    throw error;
  }
};

/**
 * Get lock statistics
 * @returns {Promise<Object>}
 */
const getLockStats = async () => {
  try {
    const client = redisClient || await initializeRedis();
    
    // Get all lock keys
    const lockKeys = await client.keys('lock:*');
    
    const stats = {
      totalLocks: lockKeys.length,
      locks: []
    };
    
    for (const key of lockKeys) {
      const lockId = await client.get(key);
      const ttl = await client.ttl(key);
      const resource = key.replace('lock:', '');
      
      stats.locks.push({
        resource: resource,
        lockId: lockId,
        ttl: ttl
      });
    }
    
    return stats;
    
  } catch (error) {
    console.error(' Error getting lock stats:', error);
    return {
      totalLocks: 0,
      locks: [],
      error: error.message
    };
  }
};

/**
 * Clean up expired locks (utility function)
 * @returns {Promise<number>} Number of locks cleaned up
 */
const cleanupExpiredLocks = async () => {
  try {
    const client = redisClient || await initializeRedis();
    const lockKeys = await client.keys('lock:*');
    
    let cleanedCount = 0;
    
    for (const key of lockKeys) {
      const ttl = await client.ttl(key);
      if (ttl === -2) { // Key doesn't exist (expired)
        cleanedCount++;
      }
    }
    
    console.log(`🧹 Cleaned up ${cleanedCount} expired locks`);
    return cleanedCount;
    
  } catch (error) {
    console.error(' Error cleaning up locks:', error);
    return 0;
  }
};

module.exports = {
  initializeRedis,
  acquireLock,
  releaseLock,
  extendLock,
  isLocked,
  withLock,
  getLockStats,
  cleanupExpiredLocks
};
