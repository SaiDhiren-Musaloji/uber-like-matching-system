const { Pool } = require('pg');
const { withLock, isLocked, getLockStats } = require('./lockService');
require('dotenv').config();

/**
 * Booking Service
 * 
 * This module handles ride bookings with atomic operations and distributed locking
 * to prevent race conditions and double-bookings.
 */

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

/**
 * Create a new booking request
 * @param {Object} bookingData - Booking data
 * @returns {Promise<Object>}
 */
const createBooking = async (bookingData) => {
  const {
    rider_id,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    estimated_fare,
    vehicle_type = 'standard'
  } = bookingData;
  
  try {
    const result = await pool.query(`
      INSERT INTO bookings (
        rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
        estimated_fare, vehicle_type, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP)
      RETURNING *
    `, [rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_fare, vehicle_type]);
    
    return {
      success: true,
      data: result.rows[0]
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Find and assign a driver to a booking (atomic operation with locking)
 * @param {number} bookingId - The booking ID
 * @returns {Promise<Object>}
 */
const assignDriver = async (bookingId) => {
  try {
    // Use distributed lock to prevent race conditions
    const result = await withLock(`booking:${bookingId}`, async () => {
      // Get booking details
      const bookingResult = await pool.query(
        'SELECT * FROM bookings WHERE id = $1 AND status = $2',
        [bookingId, 'pending']
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or already processed');
      }
      
      const booking = bookingResult.rows[0];
      
      // Find available drivers near pickup location
      // For now, accept any vehicle type to demonstrate locking functionality
      const driversResult = await pool.query(`
        SELECT id, name, phone, lat, lng, vehicle_type, rating,
               (6371 * acos(cos(radians($1)) * cos(radians(lat)) * 
                cos(radians(lng) - radians($2)) + sin(radians($1)) * 
                sin(radians(lat)))) AS distance
        FROM drivers
        WHERE status = 'online' 
          AND lat IS NOT NULL 
          AND lng IS NOT NULL
          AND (6371 * acos(cos(radians($1)) * cos(radians(lat)) * 
               cos(radians(lng) - radians($2)) + sin(radians($1)) * 
               sin(radians(lat)))) <= 10
        ORDER BY distance, rating DESC
        LIMIT 5
      `, [booking.pickup_lat, booking.pickup_lng]);
      
      if (driversResult.rows.length === 0) {
        throw new Error('No available drivers found');
      }
      
      // Try to assign the closest driver
      for (const driver of driversResult.rows) {
        // Check if driver is already locked (busy)
        const driverLockStatus = await isLocked(`driver:${driver.id}`);
        
        if (!driverLockStatus.locked) {
          // Update booking with driver assignment
          const updateResult = await pool.query(`
            UPDATE bookings 
            SET driver_id = $1, status = 'assigned', assigned_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND status = 'pending'
            RETURNING *
          `, [driver.id, bookingId]);
          
          if (updateResult.rows.length > 0) {
            // Update driver status to busy
            await pool.query(
              'UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              ['busy', driver.id]
            );
            
            return {
              success: true,
              booking: updateResult.rows[0],
              driver: driver,
              message: 'Driver assigned successfully'
            };
          }
        }
      }
      
      throw new Error('All nearby drivers are currently busy');
      
    }, {
      ttlSeconds: 30,
      retryAttempts: 3,
      retryDelayMs: 100
    });
    
    return result;
    
  } catch (error) {
    console.error('Error assigning driver:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Driver accepts a booking (atomic operation)
 * @param {number} bookingId - The booking ID
 * @param {number} driverId - The driver ID
 * @returns {Promise<Object>}
 */
const acceptBooking = async (bookingId, driverId) => {
  try {
    const result = await withLock(`booking:${bookingId}`, async () => {
      // Verify booking is assigned to this driver
      const bookingResult = await pool.query(
        'SELECT * FROM bookings WHERE id = $1 AND driver_id = $2 AND status = $3',
        [bookingId, driverId, 'assigned']
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or not assigned to this driver');
      }
      
      // Update booking status to accepted
      const updateResult = await pool.query(`
        UPDATE bookings 
        SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND driver_id = $2 AND status = 'assigned'
        RETURNING *
      `, [bookingId, driverId]);
      
      return {
        success: true,
        booking: updateResult.rows[0],
        message: 'Booking accepted successfully'
      };
      
    }, {
      ttlSeconds: 30,
      retryAttempts: 3,
      retryDelayMs: 100
    });
    
    return result;
    
  } catch (error) {
    console.error('Error accepting booking:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Cancel a booking (atomic operation)
 * @param {number} bookingId - The booking ID
 * @param {string} reason - Cancellation reason
 * @param {number} userId - User ID (rider or driver)
 * @param {string} userType - 'rider' or 'driver'
 * @returns {Promise<Object>}
 */
const cancelBooking = async (bookingId, reason, userId, userType) => {
  try {
    const result = await withLock(`booking:${bookingId}`, async () => {
      // Get booking details
      const bookingResult = await pool.query(
        'SELECT * FROM bookings WHERE id = $1',
        [bookingId]
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      
      const booking = bookingResult.rows[0];
      
      // Verify user has permission to cancel
      if (userType === 'rider' && booking.rider_id !== userId) {
        throw new Error('Unauthorized: Not your booking');
      }
      
      if (userType === 'driver' && booking.driver_id !== userId) {
        throw new Error('Unauthorized: Not your booking');
      }
      
      // Update booking status
      const updateResult = await pool.query(`
        UPDATE bookings 
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = $1
        WHERE id = $2 AND status IN ('pending', 'assigned', 'accepted')
        RETURNING *
      `, [reason, bookingId]);
      
      if (updateResult.rows.length === 0) {
        throw new Error('Booking cannot be cancelled in current state');
      }
      
      // If driver was assigned, make them available again
      if (booking.driver_id) {
        await pool.query(
          'UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['online', booking.driver_id]
        );
      }
      
      return {
        success: true,
        booking: updateResult.rows[0],
        message: 'Booking cancelled successfully'
      };
      
    }, {
      ttlSeconds: 30,
      retryAttempts: 3,
      retryDelayMs: 100
    });
    
    return result;
    
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Complete a ride (atomic operation)
 * @param {number} bookingId - The booking ID
 * @param {number} driverId - The driver ID
 * @param {number} actualFare - The actual fare charged
 * @returns {Promise<Object>}
 */
const completeRide = async (bookingId, driverId, actualFare) => {
  try {
    const result = await withLock(`booking:${bookingId}`, async () => {
      // Verify booking is accepted by this driver
      const bookingResult = await pool.query(
        'SELECT * FROM bookings WHERE id = $1 AND driver_id = $2 AND status = $3',
        [bookingId, driverId, 'accepted']
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or not accepted by this driver');
      }
      
      // Update booking status to completed
      const updateResult = await pool.query(`
        UPDATE bookings 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, actual_fare = $1
        WHERE id = $2 AND driver_id = $3 AND status = 'accepted'
        RETURNING *
      `, [actualFare, bookingId, driverId]);
      
      // Make driver available again
      await pool.query(
        'UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['online', driverId]
      );
      
      return {
        success: true,
        booking: updateResult.rows[0],
        message: 'Ride completed successfully'
      };
      
    }, {
      ttlSeconds: 30,
      retryAttempts: 3,
      retryDelayMs: 100
    });
    
    return result;
    
  } catch (error) {
    console.error('Error completing ride:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get booking by ID
 * @param {number} bookingId - The booking ID
 * @returns {Promise<Object>}
 */
const getBooking = async (bookingId) => {
  try {
    const result = await pool.query(`
      SELECT b.*, 
             d.name as driver_name, d.phone as driver_phone, d.vehicle_type,
             r.name as rider_name, r.phone as rider_phone
      FROM bookings b
      LEFT JOIN drivers d ON b.driver_id = d.id
      LEFT JOIN riders r ON b.rider_id = r.id
      WHERE b.id = $1
    `, [bookingId]);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Booking not found'
      };
    }
    
    return {
      success: true,
      data: result.rows[0]
    };
  } catch (error) {
    console.error('Error getting booking:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get bookings for a user
 * @param {number} userId - The user ID
 * @param {string} userType - 'rider' or 'driver'
 * @param {string} status - Optional status filter
 * @returns {Promise<Object>}
 */
const getUserBookings = async (userId, userType, status = null) => {
  try {
    let query = `
      SELECT b.*, 
             d.name as driver_name, d.phone as driver_phone, d.vehicle_type,
             r.name as rider_name, r.phone as rider_phone
      FROM bookings b
      LEFT JOIN drivers d ON b.driver_id = d.id
      LEFT JOIN riders r ON b.rider_id = r.id
      WHERE 
    `;
    
    const params = [];
    
    if (userType === 'rider') {
      query += 'b.rider_id = $1';
      params.push(userId);
    } else if (userType === 'driver') {
      query += 'b.driver_id = $1';
      params.push(userId);
    } else {
      throw new Error('Invalid user type');
    }
    
    if (status) {
      query += ' AND b.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY b.created_at DESC';
    
    const result = await pool.query(query, params);
    
    return {
      success: true,
      data: result.rows,
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error getting user bookings:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get lock statistics for monitoring
 * @returns {Promise<Object>}
 */
const getLockStatistics = async () => {
  try {
    const stats = await getLockStats();
    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('Error getting lock statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createBooking,
  assignDriver,
  acceptBooking,
  cancelBooking,
  completeRide,
  getBooking,
  getUserBookings,
  getLockStatistics
};
