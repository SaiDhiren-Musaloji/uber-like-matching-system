# Redis Optimization Guide

## Overview

This guide covers the Redis GEO optimization implementation that dramatically improves proximity search performance from 450ms to sub-50ms.

---

##  *Day 1-2: Introduction to Redis Geo*

**Learning Objectives*
- Understand Redis GEO commands
- Learn how geospatial indexing works
- Implement Redis client connection
- Sync data between PostgreSQL and Redis

**What You'll Build*
- Redis client connection
- GEOADD commands for storing locations
- GEOSEARCH for finding nearby drivers
- Dual-write strategy (PostgreSQL + Redis)

**Theory (30 mins)*
Read these to understand the concepts:
- [Redis Geo Documentation](https://redis.io/commands/?group=geo)
- [How Redis Geo Works Internally](https://redis.io/docs/data-types/geospatial/)
- [Geohash Algorithm](https://en.wikipedia.org/wiki/Geohash)

**Hands-On Exercise (90 mins)*

#### *Step 1: Start Redis*
```bash
docker-compose up -d redis
```

#### *Step 2: Test Redis connection*
```bash
docker exec -it uber_redis redis-cli PING
```

#### *Step 3: Manual testing of Redis GEO commands*
```bash
# Connect to Redis CLI
docker exec -it uber_redis redis-cli

# Add a driver location (NYC)
GEOADD drivers 40.7128 -74.0060 "driver:1"

# Find nearby drivers
GEOSEARCH drivers FROMLONLAT -74.0060 40.7128 BYRADIUS 5 km WITHCOORD WITHDIST

# Get distance between two points
GEODIST drivers driver:1 driver:2 km
```

**Testing (30 mins)*
- Test all Redis GEO commands
- Understand the coordinate system
- Practice with different radius values

**Reflection (30 mins)*
Answer these questions:
1. How does Redis store geospatial data?
2. What's the difference between GEOADD and regular SET?
3. Why is GEOSEARCH faster than SQL queries?

---

##  *Day 3-4: Implement Redis Geo in API*

**Learning Objectives*
- Implement Redis client in Node.js
- Create location sync service
- Update proximity search endpoint
- Handle Redis failures gracefully

**What You'll Build*
- Redis connection service
- Location sync logic (PostgreSQL → Redis)
- Optimized proximity search endpoint
- Performance comparison tools

**Theory (30 mins)*
- [Redis Node.js Client](https://github.com/redis/node-redis)
- [Geo Indexing Performance](https://redis.io/docs/data-types/geospatial/)
- [Fallback Strategies](https://redis.io/docs/manual/patterns/)

**Hands-On Exercise (90 mins)*

#### *Step 1: Set up Redis client*
Create a Redis service module to handle all Redis operations.

#### *Step 2: Implement location sync*
When a driver's location is updated in PostgreSQL, also update Redis.

#### *Step 3: Implement optimized proximity search*
Replace the SQL query with Redis GEOSEARCH.

#### *Step 4: Add performance logging*
Log query times for both old and new methods.

**Testing (30 mins)*
- Test location updates
- Test proximity search with Redis
- Compare performance metrics

**Reflection (30 mins)*
Answer these questions:
1. What happens if Redis goes down?
2. How do we keep Redis in sync with PostgreSQL?
3. What's the performance difference?

---

##  *Day 5: Performance Comparison & Optimization*

**Learning Objectives*
- Benchmark Redis vs SQL performance
- Understand the improvement metrics
- Optimize Redis usage
- Handle edge cases

**What You'll Build*
- Comprehensive benchmarking script
- Performance comparison report
- Redis monitoring
- Optimization strategies

**Theory (30 mins)*
- [Redis Performance Optimization](https://redis.io/docs/manual/optimization/)
- [Benchmarking Best Practices](https://redis.io/docs/management/optimization/benchmarks/)
- [Memory Management](https://redis.io/docs/manual/optimization/memory-optimization/)

**Hands-On Exercise (90 mins)*

#### *Step 1: Run performance benchmark*
```bash
npm run benchmark-week2
```

#### *Step 2: Compare results*
Document the performance improvements.

#### *Step 3: Optimize Redis usage*
- Tune Redis configuration
- Optimize data structures
- Implement caching strategies

#### *Step 4: Handle edge cases*
- Redis connection failures
- Data synchronization issues
- High concurrency scenarios

**Testing (30 mins)*
- Stress test with high load
- Test Redis failure scenarios
- Verify data consistency

**Reflection (30 mins)*
Answer these questions:
1. What's the actual performance improvement?
2. What are the trade-offs of using Redis?
3. How do we handle Redis failures gracefully?

---

##  *Week 2 Checkpoint*

**What You Should Understand*
- [ ] How Redis GEO indexing works
- [ ] Why Redis is faster than SQL for location queries
- [ ] How to sync data between PostgreSQL and Redis
- [ ] Fallback strategies for Redis failures
- [ ] Performance optimization techniques

**What You Should Be Able to Do*
- [ ] Use Redis GEO commands
- [ ] Implement dual-write pattern
- [ ] Query nearby drivers in sub-50ms
- [ ] Handle Redis connection failures
- [ ] Benchmark and compare performance

**Ready for Week 3?*
If you can answer these questions, you're ready for Week 3:
1. Why is Redis GEO faster than SQL?
2. How do we keep Redis and PostgreSQL in sync?
3. What happens if Redis fails?

---

##  *Week 2 Resources*

**Reading List*
- [Redis Geo Documentation](https://redis.io/commands/?group=geo)
- [Redis Node.js Client](https://github.com/redis/node-redis)
- [Geohash Algorithm](https://en.wikipedia.org/wiki/Geohash)
- [Spatial Indexing](https://www.postgresql.org/docs/current/btree-gist.html)

**Tools You'll Use*
- Redis for geospatial indexing
- Redis CLI for testing
- Node.js Redis client
- Benchmarking tools

**Next Week Preview*
In Week 3, we'll implement distributed locking to prevent double-bookings and handle concurrent requests!

---

##  *Testing Commands*

```bash
# Test Redis connection
docker exec -it uber_redis redis-cli PING

# Add test location
docker exec -it uber_redis redis-cli GEOADD drivers 40.7128 -74.0060 "driver:1"

# Find nearby drivers
docker exec -it uber_redis redis-cli GEOSEARCH drivers FROMLONLAT -74.0060 40.7128 BYRADIUS 5 km

# Check all drivers
docker exec -it uber_redis redis-cli ZRANGE drivers 0 -1 WITHSCORES

# Performance testing
npm run benchmark-week2

# Monitor Redis
docker exec -it uber_redis redis-cli MONITOR
```

---

##  *Performance Targets*

| Metric | Week 1 (SQL) | Week 2 (Redis) | Target |
|--------|--------------|----------------|--------|
| Avg Latency | 450ms | < 50ms | < 50ms |
| P95 Latency | 800ms | < 100ms | < 100ms |
| Throughput | 20 req/s | 500+ req/s | 500+ req/s |

---

*Remember: The goal is to understand geospatial indexing and why Redis is optimized for location queries!* 
