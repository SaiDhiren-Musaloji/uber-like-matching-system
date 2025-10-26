const { createClient } = require('redis');
require('dotenv').config();

/**
 * Message Queue Service
 * 
 * This module provides reliable message processing using Redis as a message queue
 * with support for different queue types, priority handling, and error recovery.
 */

let redisClient = null;

// Queue statistics
const queueStats = {
  messagesEnqueued: 0,
  messagesProcessed: 0,
  messagesFailed: 0,
  messagesRetried: 0,
  queues: new Map()
};

// Queue configurations
const queueConfigs = {
  booking_queue: {
    priority: 'high',
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    processingTimeout: 30000, // 30 seconds
    maxConcurrency: 10
  },
  notification_queue: {
    priority: 'medium',
    maxRetries: 2,
    retryDelay: 3000,
    processingTimeout: 15000,
    maxConcurrency: 20
  },
  analytics_queue: {
    priority: 'low',
    maxRetries: 1,
    retryDelay: 10000,
    processingTimeout: 60000,
    maxConcurrency: 5
  },
  cleanup_queue: {
    priority: 'low',
    maxRetries: 2,
    retryDelay: 30000,
    processingTimeout: 300000, // 5 minutes
    maxConcurrency: 2
  }
};

// Active processors
const activeProcessors = new Map(); // queueName -> Set of processor IDs

/**
 * Initialize Redis client for message queue
 */
const initializeRedis = async () => {
  try {
    redisClient = createClient({
      url: `redis://${(process.env && process.env.REDIS_HOST) || 'localhost'}:${(process.env && process.env.REDIS_PORT) || 6379}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(' Redis Queue connection failed after 10 attempts');
            return false;
          }
          return retries * 100;
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error(' Redis Queue Error:', err);
    });

    await redisClient.connect();
    console.log(' Message Queue Redis client initialized');
  } catch (error) {
    console.error(' Failed to initialize Message Queue Redis:', error);
    throw error;
  }
};

/**
 * Enqueue a message
 * @param {string} queueName - Queue name
 * @param {Object} message - Message data
 * @param {Object} options - Enqueue options
 */
const enqueue = async (queueName, message, options = {}) => {
  try {
    const config = queueConfigs[queueName] || queueConfigs.booking_queue;
    
    const queueMessage = {
      id: generateMessageId(),
      queue: queueName,
      data: message,
      priority: options.priority || config.priority,
      maxRetries: options.maxRetries || config.maxRetries,
      retryCount: 0,
      createdAt: Date.now(),
      scheduledAt: options.scheduledAt || Date.now(),
      metadata: options.metadata || {}
    };

    // Store message in Redis
    const messageKey = `queue:${queueName}:message:${queueMessage.id}`;
    await redisClient.hSet(messageKey, {
      id: queueMessage.id,
      queue: queueMessage.queue,
      data: JSON.stringify(queueMessage.data),
      priority: queueMessage.priority,
      maxRetries: queueMessage.maxRetries,
      retryCount: queueMessage.retryCount,
      createdAt: queueMessage.createdAt,
      scheduledAt: queueMessage.scheduledAt,
      metadata: JSON.stringify(queueMessage.metadata)
    });

    // Add to priority queue
    const priorityScore = getPriorityScore(queueMessage.priority);
    await redisClient.zAdd(`queue:${queueName}:pending`, {
      score: priorityScore,
      value: queueMessage.id
    });

    // Update statistics
    queueStats.messagesEnqueued++;
    const queueStat = queueStats.queues.get(queueName) || { enqueued: 0, processed: 0, failed: 0 };
    queueStat.enqueued++;
    queueStats.queues.set(queueName, queueStat);

    console.log(`Message enqueued: ${queueName} (ID: ${queueMessage.id})`);
    return queueMessage;

  } catch (error) {
    console.error(` Error enqueuing message to ${queueName}:`, error);
    throw error;
  }
};

/**
 * Dequeue a message
 * @param {string} queueName - Queue name
 * @returns {Object|null} Message data
 */
const dequeue = async (queueName) => {
  try {
    // Get highest priority message
    const result = await redisClient.zPopMax(`queue:${queueName}:pending`);
    
    if (!result || result.length === 0) {
      return null;
    }

    const messageId = result[0].value;
    const messageKey = `queue:${queueName}:message:${messageId}`;
    
    // Get message data
    const messageData = await redisClient.hGetAll(messageKey);
    
    if (Object.keys(messageData).length === 0) {
      return null;
    }

    const message = {
      id: messageData.id,
      queue: messageData.queue,
      data: JSON.parse(messageData.data),
      priority: messageData.priority,
      maxRetries: parseInt(messageData.maxRetries),
      retryCount: parseInt(messageData.retryCount),
      createdAt: parseInt(messageData.createdAt),
      scheduledAt: parseInt(messageData.scheduledAt),
      metadata: JSON.parse(messageData.metadata)
    };

    // Move to processing queue
    await redisClient.hSet(`queue:${queueName}:processing:${messageId}`, {
      startedAt: Date.now(),
      processorId: generateProcessorId()
    });

    console.log(`📤 Message dequeued: ${queueName} (ID: ${message.id})`);
    return message;

  } catch (error) {
    console.error(` Error dequeuing message from ${queueName}:`, error);
    return null;
  }
};

/**
 * Process a message
 * @param {string} queueName - Queue name
 * @param {Function} processor - Message processor function
 * @param {Object} options - Processing options
 */
const process = async (queueName, processor, options = {}) => {
  const config = queueConfigs[queueName] || queueConfigs.booking_queue;
  const processorId = generateProcessorId();
  
  try {
    // Register processor
    if (!activeProcessors.has(queueName)) {
      activeProcessors.set(queueName, new Set());
    }
    activeProcessors.get(queueName).add(processorId);

    console.log(` Starting processor for ${queueName} (ID: ${processorId})`);

    while (true) {
      try {
        // Check concurrency limit
        const currentProcessors = activeProcessors.get(queueName).size;
        if (currentProcessors > config.maxConcurrency) {
          console.log(`⏳ Concurrency limit reached for ${queueName}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Dequeue message
        const message = await dequeue(queueName);
        
        if (!message) {
          // No messages available, wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Process message
        await processMessage(queueName, message, processor, processorId);

      } catch (error) {
        console.error(` Error in processor loop for ${queueName}:`, error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

  } catch (error) {
    console.error(` Critical error in processor for ${queueName}:`, error);
  } finally {
    // Unregister processor
    if (activeProcessors.has(queueName)) {
      activeProcessors.get(queueName).delete(processorId);
    }
    console.log(` Processor stopped for ${queueName} (ID: ${processorId})`);
  }
};

/**
 * Process a single message
 * @param {string} queueName - Queue name
 * @param {Object} message - Message to process
 * @param {Function} processor - Processor function
 * @param {string} processorId - Processor ID
 */
const processMessage = async (queueName, message, processor, processorId) => {
  const config = queueConfigs[queueName] || queueConfigs.booking_queue;
  
  try {
    console.log(` Processing message: ${queueName} (ID: ${message.id})`);
    
    // Set processing timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), config.processingTimeout);
    });

    // Process message with timeout
    await Promise.race([
      processor(message),
      timeoutPromise
    ]);

    // Mark as processed
    await markAsProcessed(queueName, message.id);
    
    // Update statistics
    queueStats.messagesProcessed++;
    const queueStat = queueStats.queues.get(queueName) || { enqueued: 0, processed: 0, failed: 0 };
    queueStat.processed++;
    queueStats.queues.set(queueName, queueStat);

    console.log(` Message processed: ${queueName} (ID: ${message.id})`);

  } catch (error) {
    console.error(` Error processing message ${message.id}:`, error);
    
    // Handle retry logic
    if (message.retryCount < message.maxRetries) {
      await retryMessage(queueName, message);
    } else {
      await moveToDeadLetterQueue(queueName, message, error);
    }
  }
};

/**
 * Mark message as processed
 * @param {string} queueName - Queue name
 * @param {string} messageId - Message ID
 */
const markAsProcessed = async (queueName, messageId) => {
  try {
    // Remove from processing queue
    await redisClient.del(`queue:${queueName}:processing:${messageId}`);
    
    // Remove message data
    await redisClient.del(`queue:${queueName}:message:${messageId}`);
    
    // Add to processed queue for audit
    await redisClient.lPush(`queue:${queueName}:processed`, messageId);
    
    // Keep only last 1000 processed messages
    await redisClient.lTrim(`queue:${queueName}:processed`, 0, 999);
    
  } catch (error) {
    console.error(` Error marking message as processed:`, error);
  }
};

/**
 * Retry a failed message
 * @param {string} queueName - Queue name
 * @param {Object} message - Message to retry
 */
const retryMessage = async (queueName, message) => {
  try {
    const config = queueConfigs[queueName] || queueConfigs.booking_queue;
    
    // Increment retry count
    message.retryCount++;
    
    // Update message data
    const messageKey = `queue:${queueName}:message:${message.id}`;
    await redisClient.hSet(messageKey, 'retryCount', message.retryCount);
    
    // Remove from processing queue
    await redisClient.del(`queue:${queueName}:processing:${message.id}`);
    
    // Schedule retry
    const retryDelay = config.retryDelay * Math.pow(2, message.retryCount - 1); // Exponential backoff
    const scheduledAt = Date.now() + retryDelay;
    
    await redisClient.hSet(messageKey, 'scheduledAt', scheduledAt);
    
    // Add back to pending queue with lower priority
    const priorityScore = getPriorityScore(message.priority) - message.retryCount;
    await redisClient.zAdd(`queue:${queueName}:pending`, {
      score: priorityScore,
      value: message.id
    });

    queueStats.messagesRetried++;
    console.log(` Message retried: ${queueName} (ID: ${message.id}, attempt ${message.retryCount})`);

  } catch (error) {
    console.error(` Error retrying message:`, error);
  }
};

/**
 * Move message to dead letter queue
 * @param {string} queueName - Queue name
 * @param {Object} message - Message to move
 * @param {Error} error - Error that caused failure
 */
const moveToDeadLetterQueue = async (queueName, message, error) => {
  try {
    const deadLetterMessage = {
      ...message,
      failedAt: Date.now(),
      error: error.message,
      stack: error.stack
    };

    // Store in dead letter queue
    await redisClient.lPush(`queue:${queueName}:deadletter`, JSON.stringify(deadLetterMessage));
    
    // Remove from processing queue
    await redisClient.del(`queue:${queueName}:processing:${message.id}`);
    
    // Remove message data
    await redisClient.del(`queue:${queueName}:message:${message.id}`);

    queueStats.messagesFailed++;
    const queueStat = queueStats.queues.get(queueName) || { enqueued: 0, processed: 0, failed: 0 };
    queueStat.failed++;
    queueStats.queues.set(queueName, queueStat);

    console.log(`💀 Message moved to dead letter queue: ${queueName} (ID: ${message.id})`);

  } catch (error) {
    console.error(` Error moving message to dead letter queue:`, error);
  }
};

/**
 * Get priority score for queue ordering
 * @param {string} priority - Priority level
 * @returns {number} Priority score
 */
const getPriorityScore = (priority) => {
  const scores = {
    'high': 1000,
    'medium': 500,
    'low': 100
  };
  return scores[priority] || 500;
};

/**
 * Generate unique message ID
 * @returns {string} Unique message ID
 */
const generateMessageId = () => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate unique processor ID
 * @returns {string} Unique processor ID
 */
const generateProcessorId = () => {
  return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get queue statistics
 * @returns {Object} Queue statistics
 */
const getQueueStats = () => {
  return {
    ...queueStats,
    queues: Object.fromEntries(queueStats.queues),
    activeProcessors: Object.fromEntries(
      Array.from(activeProcessors.entries()).map(([queue, processors]) => [
        queue, 
        processors.size
      ])
    )
  };
};

/**
 * Get queue health status
 * @param {string} queueName - Queue name
 * @returns {Object} Queue health status
 */
const getQueueHealth = async (queueName) => {
  try {
    const pendingCount = await redisClient.zCard(`queue:${queueName}:pending`);
    const processingCount = await redisClient.keys(`queue:${queueName}:processing:*`).then(keys => keys.length);
    const deadLetterCount = await redisClient.lLen(`queue:${queueName}:deadletter`);
    const processedCount = await redisClient.lLen(`queue:${queueName}:processed`);

    return {
      queueName,
      pending: pendingCount,
      processing: processingCount,
      deadLetter: deadLetterCount,
      processed: processedCount,
      healthy: deadLetterCount < 100 // Consider unhealthy if too many dead letters
    };
  } catch (error) {
    console.error(` Error getting queue health for ${queueName}:`, error);
    return {
      queueName,
      pending: 0,
      processing: 0,
      deadLetter: 0,
      processed: 0,
      healthy: false,
      error: error.message
    };
  }
};

/**
 * Clear queue
 * @param {string} queueName - Queue name
 * @param {string} type - Queue type (pending, processing, deadletter, processed)
 */
const clearQueue = async (queueName, type = 'pending') => {
  try {
    switch (type) {
      case 'pending':
        await redisClient.del(`queue:${queueName}:pending`);
        break;
      case 'processing':
        const processingKeys = await redisClient.keys(`queue:${queueName}:processing:*`);
        if (processingKeys.length > 0) {
          await redisClient.del(processingKeys);
        }
        break;
      case 'deadletter':
        await redisClient.del(`queue:${queueName}:deadletter`);
        break;
      case 'processed':
        await redisClient.del(`queue:${queueName}:processed`);
        break;
      case 'all':
        await redisClient.del(`queue:${queueName}:pending`);
        const allProcessingKeys = await redisClient.keys(`queue:${queueName}:processing:*`);
        if (allProcessingKeys.length > 0) {
          await redisClient.del(allProcessingKeys);
        }
        await redisClient.del(`queue:${queueName}:deadletter`);
        await redisClient.del(`queue:${queueName}:processed`);
        break;
    }
    
    console.log(`🧹 Cleared ${queueName} queue (${type})`);
  } catch (error) {
    console.error(` Error clearing queue ${queueName}:`, error);
  }
};

/**
 * Close queue service
 */
const closeQueueService = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      console.log(' Queue Redis client closed');
    }
  } catch (error) {
    console.error(' Error closing queue service:', error);
  }
};

module.exports = {
  initializeRedis,
  enqueue,
  dequeue,
  process,
  getQueueStats,
  getQueueHealth,
  clearQueue,
  closeQueueService
};
