const { createClient } = require('redis');
require('dotenv').config();

/**
 * Event Service (Week 4)
 * 
 * This module provides event-driven architecture using Redis Pub/Sub
 * for event broadcasting, subscription management, and event persistence.
 */

let publisher = null;
let subscriber = null;
let redisClient = null;

// Event statistics
const eventStats = {
  eventsPublished: 0,
  eventsReceived: 0,
  subscriptions: 0,
  errors: 0,
  eventTypes: new Map()
};

// Event subscriptions
const subscriptions = new Map(); // eventType -> Set of handlers

/**
 * Initialize Redis clients for event system
 */
const initializeRedis = async () => {
  try {
    // Publisher client
    publisher = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(' Redis Publisher connection failed after 10 attempts');
            return false;
          }
          return retries * 100;
        }
      }
    });

    publisher.on('error', (err) => {
      console.error(' Redis Publisher Error:', err);
    });

    await publisher.connect();

    // Subscriber client
    subscriber = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(' Redis Subscriber connection failed after 10 attempts');
            return false;
          }
          return retries * 100;
        }
      }
    });

    subscriber.on('error', (err) => {
      console.error(' Redis Subscriber Error:', err);
    });

    await subscriber.connect();

    // General Redis client for data operations
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(' Redis Client connection failed after 10 attempts');
            return false;
          }
          return retries * 100;
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error(' Redis Client Error:', err);
    });

    await redisClient.connect();

    console.log(' Event Service Redis clients initialized');
  } catch (error) {
    console.error(' Failed to initialize Event Service Redis:', error);
    throw error;
  }
};

/**
 * Publish an event
 * @param {string} eventType - Type of event
 * @param {Object} eventData - Event data
 * @param {Object} options - Publishing options
 */
const publishEvent = async (eventType, eventData, options = {}) => {
  try {
    const event = {
      id: generateEventId(),
      type: eventType,
      data: eventData,
      timestamp: Date.now(),
      source: options.source || 'system',
      version: options.version || '1.0',
      metadata: options.metadata || {}
    };

    // Publish to Redis channel
    await publisher.publish(`events:${eventType}`, JSON.stringify(event));
    
    // Store event for persistence (optional)
    if (options.persist !== false) {
      await storeEvent(event);
    }

    // Update statistics
    eventStats.eventsPublished++;
    const typeCount = eventStats.eventTypes.get(eventType) || 0;
    eventStats.eventTypes.set(eventType, typeCount + 1);

    console.log(`📡 Event published: ${eventType} (ID: ${event.id})`);
    return event;

  } catch (error) {
    console.error(` Error publishing event ${eventType}:`, error);
    eventStats.errors++;
    throw error;
  }
};

/**
 * Subscribe to an event type
 * @param {string} eventType - Event type to subscribe to
 * @param {Function} handler - Event handler function
 * @param {Object} options - Subscription options
 */
const subscribeToEvent = async (eventType, handler, options = {}) => {
  try {
    // Add handler to subscriptions
    if (!subscriptions.has(eventType)) {
      subscriptions.set(eventType, new Set());
      
      // Subscribe to Redis channel
      await subscriber.subscribe(`events:${eventType}`, (message) => {
        try {
          const event = JSON.parse(message);
          handleEventMessage(eventType, event);
        } catch (error) {
          console.error(` Error parsing event message for ${eventType}:`, error);
          eventStats.errors++;
        }
      });
    }

    subscriptions.get(eventType).add(handler);
    eventStats.subscriptions++;

    console.log(`📡 Subscribed to event: ${eventType}`);
    return true;

  } catch (error) {
    console.error(` Error subscribing to event ${eventType}:`, error);
    eventStats.errors++;
    throw error;
  }
};

/**
 * Unsubscribe from an event type
 * @param {string} eventType - Event type to unsubscribe from
 * @param {Function} handler - Event handler function
 */
const unsubscribeFromEvent = async (eventType, handler) => {
  try {
    if (subscriptions.has(eventType)) {
      subscriptions.get(eventType).delete(handler);
      
      // If no more handlers, unsubscribe from Redis channel
      if (subscriptions.get(eventType).size === 0) {
        await subscriber.unsubscribe(`events:${eventType}`);
        subscriptions.delete(eventType);
      }
      
      eventStats.subscriptions--;
      console.log(`📡 Unsubscribed from event: ${eventType}`);
    }
  } catch (error) {
    console.error(` Error unsubscribing from event ${eventType}:`, error);
    eventStats.errors++;
  }
};

/**
 * Handle incoming event message
 * @param {string} eventType - Event type
 * @param {Object} event - Event data
 */
const handleEventMessage = async (eventType, event) => {
  try {
    eventStats.eventsReceived++;
    
    if (subscriptions.has(eventType)) {
      const handlers = subscriptions.get(eventType);
      
      // Call all handlers for this event type
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(` Error in event handler for ${eventType}:`, error);
          eventStats.errors++;
        }
      }
    }
  } catch (error) {
    console.error(` Error handling event message:`, error);
    eventStats.errors++;
  }
};

/**
 * Store event for persistence
 * @param {Object} event - Event to store
 */
const storeEvent = async (event) => {
  try {
    const key = `event:${event.id}`;
    await redisClient.hSet(key, {
      id: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
      timestamp: event.timestamp,
      source: event.source,
      version: event.version,
      metadata: JSON.stringify(event.metadata)
    });
    
    // Set expiration (24 hours by default)
    await redisClient.expire(key, 86400);
  } catch (error) {
    console.error(' Error storing event:', error);
  }
};

/**
 * Retrieve stored event
 * @param {string} eventId - Event ID
 * @returns {Object|null} Stored event
 */
const getStoredEvent = async (eventId) => {
  try {
    const key = `event:${eventId}`;
    const eventData = await redisClient.hGetAll(key);
    
    if (Object.keys(eventData).length === 0) {
      return null;
    }
    
    return {
      id: eventData.id,
      type: eventData.type,
      data: JSON.parse(eventData.data),
      timestamp: parseInt(eventData.timestamp),
      source: eventData.source,
      version: eventData.version,
      metadata: JSON.parse(eventData.metadata)
    };
  } catch (error) {
    console.error(' Error retrieving stored event:', error);
    return null;
  }
};

/**
 * Generate unique event ID
 * @returns {string} Unique event ID
 */
const generateEventId = () => {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get event statistics
 * @returns {Object} Event statistics
 */
const getEventStats = () => {
  return {
    ...eventStats,
    eventTypes: Object.fromEntries(eventStats.eventTypes),
    activeSubscriptions: subscriptions.size
  };
};

/**
 * Get active subscriptions
 * @returns {Array} Active subscriptions
 */
const getActiveSubscriptions = () => {
  const activeSubs = [];
  
  for (const [eventType, handlers] of subscriptions) {
    activeSubs.push({
      eventType,
      handlerCount: handlers.size
    });
  }
  
  return activeSubs;
};

/**
 * Publish booking-related events
 */
const publishBookingEvent = async (eventType, bookingData, options = {}) => {
  const eventData = {
    booking_id: bookingData.id,
    rider_id: bookingData.rider_id,
    driver_id: bookingData.driver_id,
    status: bookingData.status,
    pickup_location: {
      lat: bookingData.pickup_lat,
      lng: bookingData.pickup_lng
    },
    dropoff_location: {
      lat: bookingData.dropoff_lat,
      lng: bookingData.dropoff_lng
    },
    estimated_fare: bookingData.estimated_fare,
    actual_fare: bookingData.actual_fare,
    ...options.additionalData
  };

  return await publishEvent(`booking:${eventType}`, eventData, {
    source: 'booking_service',
    ...options
  });
};

/**
 * Publish driver-related events
 */
const publishDriverEvent = async (eventType, driverData, options = {}) => {
  const eventData = {
    driver_id: driverData.id,
    name: driverData.name,
    status: driverData.status,
    location: {
      lat: driverData.lat,
      lng: driverData.lng
    },
    vehicle_type: driverData.vehicle_type,
    rating: driverData.rating,
    ...options.additionalData
  };

  return await publishEvent(`driver:${eventType}`, eventData, {
    source: 'driver_service',
    ...options
  });
};

/**
 * Publish system events
 */
const publishSystemEvent = async (eventType, systemData, options = {}) => {
  return await publishEvent(`system:${eventType}`, systemData, {
    source: 'system',
    ...options
  });
};

/**
 * Close event service connections
 */
const closeEventService = async () => {
  try {
    if (publisher) {
      await publisher.quit();
      console.log(' Event Publisher closed');
    }
    
    if (subscriber) {
      await subscriber.quit();
      console.log(' Event Subscriber closed');
    }
    
    if (redisClient) {
      await redisClient.quit();
      console.log(' Event Redis Client closed');
    }
  } catch (error) {
    console.error(' Error closing event service:', error);
  }
};

module.exports = {
  initializeRedis,
  publishEvent,
  subscribeToEvent,
  unsubscribeFromEvent,
  getStoredEvent,
  getEventStats,
  getActiveSubscriptions,
  publishBookingEvent,
  publishDriverEvent,
  publishSystemEvent,
  closeEventService
};
