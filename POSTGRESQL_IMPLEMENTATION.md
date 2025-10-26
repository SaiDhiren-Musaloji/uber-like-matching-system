# PostgreSQL Implementation Guide

## Overview

This guide covers the basic PostgreSQL implementation of the driver matching system. This serves as the foundation for understanding the core concepts before moving to optimized implementations.

---

## Day 1-2: Scaffold the API

### Learning Objectives
- Understand Express.js basics
- Learn PostgreSQL connection and setup
- Implement basic CRUD operations
- Understand input validation

### What You'll Build
- Basic Express.js server
- PostgreSQL database connection
- CRUD endpoints for drivers
- Input validation middleware

**Theory (30 mins)*
Read these to understand the concepts:
- [Express.js Getting Started](https://expressjs.com/en/starter/installing.html)
- [PostgreSQL Connection in Node.js](https://node-postgres.com/features/connecting)
- [REST API Design Best Practices](https://restfulapi.net/)

**Hands-On Exercise (90 mins)*

#### *Step 1: Set up your environment*
```bash
# Clone and setup
git clone https://github.com/SaiDhiren-Musaloji/uber-like-matching-system.git
cd uber-like-matching-system
npm install

# Start PostgreSQL
docker-compose up -d postgres

# Set up database
npm run setup-week1
```

#### *Step 2: Start the API*
```bash
npm start
```

#### *Step 3: Test the endpoints*
```bash
# Health check
curl http://localhost:3000/api/health

# Get all drivers (empty initially)
curl http://localhost:3000/api/drivers

# Create a driver
curl -X POST http://localhost:3000/api/drivers \
  -H "Content-Type: application/json" \
  -d '{"name":"John Smith","phone":"+1234567890","vehicle_type":"sedan"}'

# Update driver location
curl -X POST http://localhost:3000/api/drivers/1/location \
  -H "Content-Type: application/json" \
  -d '{"lat":40.7128,"lng":-74.0060}'
```

**Testing (30 mins)*
- Test all CRUD operations
- Try invalid inputs to test validation
- Check error handling

**Reflection (30 mins)*
Answer these questions:
1. How does Express.js handle HTTP requests?
2. Why do we use parameterized queries?
3. What happens if you don't validate input?

---

##  *Day 3-4: Implement Naive Proximity Search*

### Learning Objectives
- Understand the Haversine formula for distance calculation
- Implement basic proximity search in SQL
- Learn why this approach is slow
- Generate test data for performance testing

### What You'll Build
- Proximity search endpoint using SQL
- Test data generation script
- Performance measurement tools

**Theory (30 mins)*
- [Haversine Formula Explained](https://en.wikipedia.org/wiki/Haversine_formula)
- [Why Spatial Queries Are Slow](https://www.postgresql.org/docs/current/btree-gist.html)
- [Database Indexing Basics](https://use-the-index-luke.com/)

**Hands-On Exercise (90 mins)*

#### *Step 1: Seed test data*
```bash
npm run seed-week1
```

This creates 10,000 drivers with random coordinates around NYC.

#### *Step 2: Test the proximity search*
```bash
# Find drivers near NYC center
curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"

# Try different locations
curl "http://localhost:3000/api/drivers/nearby?lat=40.7589&lng=-73.9851&radius=3"
```

#### *Step 3: Run performance benchmark*
```bash
npm run benchmark
```

#### *Step 4: Analyze the slow query*
```sql
-- Connect to your database and run this
EXPLAIN ANALYZE
SELECT id, name, phone, lat, lng, status, vehicle_type, rating,
       (6371 * acos(cos(radians(40.7128)) * cos(radians(lat)) * 
        cos(radians(lng) - radians(-74.0060)) + sin(radians(40.7128)) * 
        sin(radians(lat)))) AS distance
FROM drivers
WHERE status = 'online' 
  AND lat IS NOT NULL 
  AND lng IS NOT NULL
  AND (6371 * acos(cos(radians(40.7128)) * cos(radians(lat)) * 
       cos(radians(lng) - radians(-74.0060)) + sin(radians(40.7128)) * 
       sin(radians(lat)))) <= 5
ORDER BY distance
LIMIT 10;
```

**Testing (30 mins)*
- Measure query performance
- Test with different radius values
- Try different locations

**Reflection (30 mins)*
Answer these questions:
1. Why is this proximity search slow?
2. What happens if you have 100,000 drivers?
3. How could we make this faster?

---

##  *Day 5: Analyze Performance*

### Learning Objectives
- Understand database query profiling
- Learn to identify performance bottlenecks
- Document performance issues
- Prepare for Week 2 optimization

### What You'll Build
- Performance analysis documentation
- Understanding of the optimization problem
- Baseline metrics for comparison

**Theory (30 mins)*
- [PostgreSQL EXPLAIN ANALYZE](https://www.postgresql.org/docs/current/using-explain.html)
- [Database Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
- [Spatial Indexing Concepts](https://postgis.net/workshops/postgis-intro/indexing.html)

**Hands-On Exercise (90 mins)*

#### *Step 1: Profile the slow query*
```sql
-- Run this in your database
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, phone, lat, lng, status, vehicle_type, rating,
       (6371 * acos(cos(radians(40.7128)) * cos(radians(lat)) * 
        cos(radians(lng) - radians(-74.0060)) + sin(radians(40.7128)) * 
        sin(radians(lat)))) AS distance
FROM drivers
WHERE status = 'online' 
  AND lat IS NOT NULL 
  AND lng IS NOT NULL
  AND (6371 * acos(cos(radians(40.7128)) * cos(radians(lat)) * 
       cos(radians(lng) - radians(-74.0060)) + sin(radians(40.7128)) * 
       sin(radians(lat)))) <= 5
ORDER BY distance
LIMIT 10;
```

#### *Step 2: Document the performance problem*
Create a file called `WEEK1_RESULTS.md`:

```markdown
# Week 1 Results

## Performance (10K drivers, naive SQL)
- Average latency: ___ms
- P95 latency: ___ms
- Throughput: ___ req/sec

## Bottleneck Analysis
- *Problem*: Haversine formula calculated for EVERY driver
- *Why it's slow*: O(N) complexity - scans every row
- *Index impact*: Normal B-tree indexes don't help with lat/lng calculations

## EXPLAIN ANALYZE Results
[Paste your EXPLAIN ANALYZE output here]

## Key Insights
1. The query scans all 10,000 drivers
2. Distance calculation happens for every row
3. No spatial indexing is used
4. Performance degrades linearly with more drivers

## Next Steps (Week 2)
- Implement geospatial indexing (Redis Geo or PostGIS)
- Target: Sub-50ms queries
- Expected improvement: 10x+ faster
```

#### *Step 3: Test edge cases*
```bash
# Test with very small radius
curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=0.1"

# Test with large radius
curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=50"

# Test with invalid coordinates
curl "http://localhost:3000/api/drivers/nearby?lat=999&lng=999&radius=5"
```

**Testing (30 mins)*
- Run comprehensive benchmarks
- Test edge cases
- Document all results

**Reflection (30 mins)*
Answer these questions:
1. What is the main performance bottleneck?
2. Why don't regular database indexes help?
3. What would happen with 1 million drivers?
4. How could we solve this problem?

---

##  *Week 1 Checkpoint*

**What You Should Understand*
- [ ] How Express.js handles HTTP requests
- [ ] PostgreSQL connection and basic queries
- [ ] Why proximity search is slow with SQL
- [ ] The Haversine formula for distance calculation
- [ ] Database query profiling with EXPLAIN ANALYZE

**What You Should Be Able to Do*
- [ ] Create a basic Express.js API
- [ ] Connect to PostgreSQL and run queries
- [ ] Implement CRUD operations
- [ ] Find nearby drivers (even if slow)
- [ ] Measure and analyze query performance

**Ready for Week 2?*
If you can answer these questions, you're ready for Week 2:
1. Why is the proximity search slow?
2. What would happen with 100,000 drivers?
3. How could we make it faster?

---

##  *Week 1 Resources*

**Reading List*
- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [REST API Design](https://restfulapi.net/)
- [Database Indexing](https://use-the-index-luke.com/)

**Tools You'll Use*
- Express.js for API
- PostgreSQL for database
- Docker for database container
- curl for API testing

**Next Week Preview*
In Week 2, we'll learn how to make the proximity search *10x faster* using Redis GEO indexing!

---

##  *Testing Commands*

```bash
# Basic API testing
curl http://localhost:3000/api/health
curl http://localhost:3000/api/drivers

# CRUD operations
curl -X POST http://localhost:3000/api/drivers \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Driver","phone":"+1234567899","vehicle_type":"sedan"}'

curl -X POST http://localhost:3000/api/drivers/1/location \
  -H "Content-Type: application/json" \
  -d '{"lat":40.7128,"lng":-74.0060}'

# Proximity search
curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"

# Performance testing
npm run benchmark
```

---

*Remember: The goal is to understand the fundamentals. Don't worry about performance yet - that's Week 2!* 
