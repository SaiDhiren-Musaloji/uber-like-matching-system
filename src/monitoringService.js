const os = require('os');
const { Pool } = require('pg');
require('dotenv').config();

/**
 * Monitoring Service (Week 4)
 * 
 * This module provides comprehensive system monitoring, metrics collection,
 * and health checks for the Uber matching system.
 */

let pool = null;
let metrics = {
  system: {
    uptime: 0,
    startTime: Date.now(),
    requests: 0,
    errors: 0,
    responseTime: {
      min: Infinity,
      max: 0,
      avg: 0,
      total: 0
    }
  },
  database: {
    connections: 0,
    queries: 0,
    queryTime: {
      min: Infinity,
      max: 0,
      avg: 0,
      total: 0
    },
    errors: 0
  },
  redis: {
    operations: 0,
    operationTime: {
      min: Infinity,
      max: 0,
      avg: 0,
      total: 0
    },
    errors: 0,
    connected: false
  },
  websocket: {
    connections: 0,
    messages: 0,
    errors: 0
  },
  events: {
    published: 0,
    received: 0,
    errors: 0
  },
  queues: {
    enqueued: 0,
    processed: 0,
    failed: 0,
    retried: 0
  }
};

// Health check results
let healthChecks = {
  database: { status: 'unknown', lastCheck: 0, responseTime: 0 },
  redis: { status: 'unknown', lastCheck: 0, responseTime: 0 },
  websocket: { status: 'unknown', lastCheck: 0, responseTime: 0 },
  events: { status: 'unknown', lastCheck: 0, responseTime: 0 },
  queues: { status: 'unknown', lastCheck: 0, responseTime: 0 }
};

/**
 * Initialize monitoring service
 */
const initializeMonitoring = async () => {
  try {
    // Initialize database connection for monitoring
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'uber_matching',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    });

    console.log(' Monitoring service initialized');
  } catch (error) {
    console.error(' Failed to initialize monitoring service:', error);
    throw error;
  }
};

/**
 * Record request metrics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in milliseconds
 */
const recordRequest = (req, res, responseTime) => {
  metrics.system.requests++;
  
  // Update response time metrics
  metrics.system.responseTime.min = Math.min(metrics.system.responseTime.min, responseTime);
  metrics.system.responseTime.max = Math.max(metrics.system.responseTime.max, responseTime);
  metrics.system.responseTime.total += responseTime;
  metrics.system.responseTime.avg = metrics.system.responseTime.total / metrics.system.requests;
  
  // Record error if status code >= 400
  if (res.statusCode >= 400) {
    metrics.system.errors++;
  }
};

/**
 * Record database query metrics
 * @param {number} queryTime - Query execution time in milliseconds
 * @param {boolean} isError - Whether the query resulted in an error
 */
const recordDatabaseQuery = (queryTime, isError = false) => {
  metrics.database.queries++;
  
  if (isError) {
    metrics.database.errors++;
  } else {
    // Update query time metrics
    metrics.database.queryTime.min = Math.min(metrics.database.queryTime.min, queryTime);
    metrics.database.queryTime.max = Math.max(metrics.database.queryTime.max, queryTime);
    metrics.database.queryTime.total += queryTime;
    metrics.database.queryTime.avg = metrics.database.queryTime.total / metrics.database.queries;
  }
};

/**
 * Record Redis operation metrics
 * @param {number} operationTime - Operation time in milliseconds
 * @param {boolean} isError - Whether the operation resulted in an error
 */
const recordRedisOperation = (operationTime, isError = false) => {
  metrics.redis.operations++;
  
  if (isError) {
    metrics.redis.errors++;
  } else {
    // Update operation time metrics
    metrics.redis.operationTime.min = Math.min(metrics.redis.operationTime.min, operationTime);
    metrics.redis.operationTime.max = Math.max(metrics.redis.operationTime.max, operationTime);
    metrics.redis.operationTime.total += operationTime;
    metrics.redis.operationTime.avg = metrics.redis.operationTime.total / metrics.redis.operations;
  }
};

/**
 * Update WebSocket metrics
 * @param {string} type - Metric type (connection, message, error)
 * @param {number} count - Count to add (default: 1)
 */
const updateWebSocketMetrics = (type, count = 1) => {
  switch (type) {
    case 'connection':
      metrics.websocket.connections += count;
      break;
    case 'message':
      metrics.websocket.messages += count;
      break;
    case 'error':
      metrics.websocket.errors += count;
      break;
  }
};

/**
 * Update event metrics
 * @param {string} type - Metric type (published, received, error)
 * @param {number} count - Count to add (default: 1)
 */
const updateEventMetrics = (type, count = 1) => {
  switch (type) {
    case 'published':
      metrics.events.published += count;
      break;
    case 'received':
      metrics.events.received += count;
      break;
    case 'error':
      metrics.events.errors += count;
      break;
  }
};

/**
 * Update queue metrics
 * @param {string} type - Metric type (enqueued, processed, failed, retried)
 * @param {number} count - Count to add (default: 1)
 */
const updateQueueMetrics = (type, count = 1) => {
  switch (type) {
    case 'enqueued':
      metrics.queues.enqueued += count;
      break;
    case 'processed':
      metrics.queues.processed += count;
      break;
    case 'failed':
      metrics.queues.failed += count;
      break;
    case 'retried':
      metrics.queues.retried += count;
      break;
  }
};

/**
 * Set Redis connection status
 * @param {boolean} connected - Redis connection status
 */
const setRedisConnectionStatus = (connected) => {
  metrics.redis.connected = connected;
};

/**
 * Perform database health check
 * @returns {Promise<Object>} Health check result
 */
const checkDatabaseHealth = async () => {
  const startTime = Date.now();
  
  try {
    const result = await pool.query('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;
    
    healthChecks.database = {
      status: 'healthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      details: {
        queryResult: result.rows[0],
        connectionCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    };
    
    return healthChecks.database;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    healthChecks.database = {
      status: 'unhealthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      error: error.message
    };
    
    return healthChecks.database;
  }
};

/**
 * Perform Redis health check
 * @param {Object} redisClient - Redis client instance
 * @returns {Promise<Object>} Health check result
 */
const checkRedisHealth = async (redisClient) => {
  const startTime = Date.now();
  
  try {
    await redisClient.ping();
    const responseTime = Date.now() - startTime;
    
    healthChecks.redis = {
      status: 'healthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      details: {
        connected: true,
        memory: await redisClient.memory('usage'),
        info: await redisClient.info('server')
      }
    };
    
    return healthChecks.redis;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    healthChecks.redis = {
      status: 'unhealthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      error: error.message
    };
    
    return healthChecks.redis;
  }
};

/**
 * Perform WebSocket health check
 * @param {Object} websocketService - WebSocket service instance
 * @returns {Promise<Object>} Health check result
 */
const checkWebSocketHealth = async (websocketService) => {
  const startTime = Date.now();
  
  try {
    const stats = websocketService.getConnectionStats();
    const responseTime = Date.now() - startTime;
    
    healthChecks.websocket = {
      status: stats.activeConnections > 0 ? 'healthy' : 'warning',
      lastCheck: Date.now(),
      responseTime: responseTime,
      details: {
        activeConnections: stats.activeConnections,
        totalConnections: stats.totalConnections,
        messagesSent: stats.messagesSent,
        messagesReceived: stats.messagesReceived,
        errors: stats.errors
      }
    };
    
    return healthChecks.websocket;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    healthChecks.websocket = {
      status: 'unhealthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      error: error.message
    };
    
    return healthChecks.websocket;
  }
};

/**
 * Perform event system health check
 * @param {Object} eventService - Event service instance
 * @returns {Promise<Object>} Health check result
 */
const checkEventHealth = async (eventService) => {
  const startTime = Date.now();
  
  try {
    const stats = eventService.getEventStats();
    const responseTime = Date.now() - startTime;
    
    healthChecks.events = {
      status: stats.eventsPublished > 0 || stats.eventsReceived > 0 ? 'healthy' : 'warning',
      lastCheck: Date.now(),
      responseTime: responseTime,
      details: {
        eventsPublished: stats.eventsPublished,
        eventsReceived: stats.eventsReceived,
        activeSubscriptions: stats.activeSubscriptions,
        errors: stats.errors
      }
    };
    
    return healthChecks.events;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    healthChecks.events = {
      status: 'unhealthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      error: error.message
    };
    
    return healthChecks.events;
  }
};

/**
 * Perform queue system health check
 * @param {Object} queueService - Queue service instance
 * @returns {Promise<Object>} Health check result
 */
const checkQueueHealth = async (queueService) => {
  const startTime = Date.now();
  
  try {
    const stats = queueService.getQueueStats();
    const responseTime = Date.now() - startTime;
    
    healthChecks.queues = {
      status: stats.messagesFailed < stats.messagesProcessed * 0.1 ? 'healthy' : 'warning',
      lastCheck: Date.now(),
      responseTime: responseTime,
      details: {
        messagesEnqueued: stats.messagesEnqueued,
        messagesProcessed: stats.messagesProcessed,
        messagesFailed: stats.messagesFailed,
        messagesRetried: stats.messagesRetried,
        activeProcessors: stats.activeProcessors
      }
    };
    
    return healthChecks.queues;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    healthChecks.queues = {
      status: 'unhealthy',
      lastCheck: Date.now(),
      responseTime: responseTime,
      error: error.message
    };
    
    return healthChecks.queues;
  }
};

/**
 * Perform comprehensive health check
 * @param {Object} services - Service instances
 * @returns {Promise<Object>} Overall health status
 */
const performHealthCheck = async (services = {}) => {
  const startTime = Date.now();
  
  try {
    // Perform individual health checks
    const checks = await Promise.allSettled([
      checkDatabaseHealth(),
      services.redisClient ? checkRedisHealth(services.redisClient) : Promise.resolve({ status: 'skipped' }),
      services.websocketService ? checkWebSocketHealth(services.websocketService) : Promise.resolve({ status: 'skipped' }),
      services.eventService ? checkEventHealth(services.eventService) : Promise.resolve({ status: 'skipped' }),
      services.queueService ? checkQueueHealth(services.queueService) : Promise.resolve({ status: 'skipped' })
    ]);
    
    const results = {
      overall: 'healthy',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime,
      checks: {
        database: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'error', error: checks[0].reason?.message },
        redis: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'error', error: checks[1].reason?.message },
        websocket: checks[2].status === 'fulfilled' ? checks[2].value : { status: 'error', error: checks[2].reason?.message },
        events: checks[3].status === 'fulfilled' ? checks[3].value : { status: 'error', error: checks[3].reason?.message },
        queues: checks[4].status === 'fulfilled' ? checks[4].value : { status: 'error', error: checks[4].reason?.message }
      }
    };
    
    // Determine overall health
    const statuses = Object.values(results.checks).map(check => check.status);
    if (statuses.includes('unhealthy')) {
      results.overall = 'unhealthy';
    } else if (statuses.includes('warning')) {
      results.overall = 'warning';
    }
    
    return results;
  } catch (error) {
    return {
      overall: 'unhealthy',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
};

/**
 * Get system metrics
 * @returns {Object} System metrics
 */
const getSystemMetrics = () => {
  const uptime = Date.now() - metrics.system.startTime;
  
  return {
    system: {
      ...metrics.system,
      uptime: uptime,
      uptimeFormatted: formatUptime(uptime),
      memory: {
        used: process.memoryUsage(),
        system: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        }
      },
      cpu: {
        loadAverage: os.loadavg(),
        cpus: os.cpus().length
      }
    },
    database: {
      ...metrics.database,
      connections: pool ? {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      } : null
    },
    redis: metrics.redis,
    websocket: metrics.websocket,
    events: metrics.events,
    queues: metrics.queues
  };
};

/**
 * Get health check results
 * @returns {Object} Health check results
 */
const getHealthChecks = () => {
  return healthChecks;
};

/**
 * Format uptime in human-readable format
 * @param {number} uptime - Uptime in milliseconds
 * @returns {string} Formatted uptime
 */
const formatUptime = (uptime) => {
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
  metrics = {
    system: {
      uptime: 0,
      startTime: Date.now(),
      requests: 0,
      errors: 0,
      responseTime: {
        min: Infinity,
        max: 0,
        avg: 0,
        total: 0
      }
    },
    database: {
      connections: 0,
      queries: 0,
      queryTime: {
        min: Infinity,
        max: 0,
        avg: 0,
        total: 0
      },
      errors: 0
    },
    redis: {
      operations: 0,
      operationTime: {
        min: Infinity,
        max: 0,
        avg: 0,
        total: 0
      },
      errors: 0,
      connected: false
    },
    websocket: {
      connections: 0,
      messages: 0,
      errors: 0
    },
    events: {
      published: 0,
      received: 0,
      errors: 0
    },
    queues: {
      enqueued: 0,
      processed: 0,
      failed: 0,
      retried: 0
    }
  };
  
  console.log(' Metrics reset');
};

/**
 * Close monitoring service
 */
const closeMonitoring = async () => {
  try {
    if (pool) {
      await pool.end();
      console.log(' Monitoring database connection closed');
    }
  } catch (error) {
    console.error(' Error closing monitoring service:', error);
  }
};

module.exports = {
  initializeMonitoring,
  recordRequest,
  recordDatabaseQuery,
  recordRedisOperation,
  updateWebSocketMetrics,
  updateEventMetrics,
  updateQueueMetrics,
  setRedisConnectionStatus,
  performHealthCheck,
  getSystemMetrics,
  getHealthChecks,
  resetMetrics,
  closeMonitoring
};
