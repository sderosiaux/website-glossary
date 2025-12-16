---
title: "Implementing CDC with Debezium"
description: "Implement Change Data Capture with Debezium to stream database changes in real-time, covering connector setup, configuration, and Kafka integration."
topics:
  - Debezium
  - Change Data Capture
  - Kafka Connect
  - Database Streaming
  - Data Integration
---

# Implementing CDC with Debezium

Change Data Capture (CDC) has become a foundational pattern for modern data architectures, enabling real-time data streaming from operational databases to downstream systems. Debezium, an open-source distributed platform built on Apache Kafka Connect, provides a robust solution for implementing CDC across various database systems.

This guide walks through the practical aspects of implementing CDC with Debezium, from understanding the underlying mechanisms to configuring connectors and integrating with the broader data streaming ecosystem.

## Understanding Debezium's CDC Approach

Debezium captures row-level changes from database transaction logs rather than querying tables directly. This log-based approach offers several advantages: minimal impact on source database performance, capture of all change types (inserts, updates, deletes), and preservation of the exact order of operations.

When a database transaction commits, the changes are first written to the transaction log (also called write-ahead log or WAL). Debezium connectors read these logs, parse the binary format, and convert change events into structured messages that flow through Kafka topics. Each table typically maps to a dedicated topic, with each message representing a single row change.

The key benefit of this architecture is that Debezium acts as a passive observer. Unlike trigger-based CDC solutions that add overhead to database operations, log-based CDC reads from logs that databases already maintain for replication and recovery purposes.

## Connector Architecture and Components

A Debezium deployment consists of several components working together. At the core is the Kafka Connect framework, which provides the runtime environment for Debezium connectors. Each connector is database-specific (MySQL, PostgreSQL, MongoDB, SQL Server, Oracle, etc.) and understands how to parse that database's transaction log format.

```
┌──────────────────────────────────────────────────────────────┐
│               Debezium CDC Architecture                      │
└──────────────────────────────────────────────────────────────┘

  ┌────────────────┐
  │ Source Database│  (PostgreSQL, MySQL, etc.)
  │  ┌──────────┐  │
  │  │ Tables   │  │
  │  └──────────┘  │
  │  ┌──────────┐  │
  │  │ TX Log   │◀─┼── Debezium reads transaction log
  │  └──────────┘  │
  └────────────────┘
         │
         ▼
  ┌────────────────────────────────────┐
  │    Kafka Connect Framework         │
  │  ┌──────────────────────────────┐  │
  │  │   Debezium Connector         │  │
  │  │  - Parses log format         │  │
  │  │  - Tracks position           │  │
  │  │  - Converts to events        │  │
  │  └──────────────────────────────┘  │
  └────────────────┬───────────────────┘
                   │
                   ▼
  ┌────────────────────────────────────┐
  │         Apache Kafka               │
  │  ┌────────┐  ┌────────┐           │
  │  │orders  │  │customer│  ...      │
  │  └────────┘  └────────┘           │
  └────────────────────────────────────┘
```

The connector runs as a task within Kafka Connect and maintains its own state, tracking which portion of the transaction log has been processed. This state is stored in Kafka topics, enabling fault tolerance: if a connector crashes and restarts, it resumes from where it left off without losing or duplicating events.

Debezium also includes a snapshot mechanism. When a connector first starts, it can optionally perform an initial snapshot of existing table data before switching to log-based streaming. This ensures downstream systems receive both historical data and ongoing changes.

## Setting Up Your First Debezium Connector

Let's walk through configuring a PostgreSQL Debezium connector. Before starting, ensure you have:

- Kafka and Kafka Connect running
- PostgreSQL configured with logical replication enabled (`wal_level = logical`)
- A replication slot and publication created for the tables you want to capture

Here's a complete, production-ready connector configuration:

```json
{
  "name": "postgres-orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres.example.com",
    "database.port": "5432",
    "database.user": "debezium_user",
    "database.password": "${env:DB_PASSWORD}",
    "database.dbname": "orders_db",
    "database.server.name": "orders_server",
    "plugin.name": "pgoutput",
    "publication.name": "dbz_publication",
    "table.include.list": "public.orders,public.order_items",
    "topic.prefix": "cdc.postgres.orders",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "heartbeat.interval.ms": "5000",
    "heartbeat.topics.prefix": "__debezium-heartbeat"
  }
}
```

Key configuration elements:

- `database.server.name`: A logical name identifying this database server, used in topic naming
- `table.include.list`: Specifies which tables to capture (use `table.exclude.list` to exclude specific tables)
- `topic.prefix`: Prefix for all Kafka topics created by this connector

Deploy this connector by POSTing the JSON to your Kafka Connect REST API:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @postgres-connector.json
```

## Configuration Patterns and Best Practices

**Snapshot Modes**: Control how initial snapshots are handled with `snapshot.mode`. Common values include:
- `initial`: Perform a snapshot on first run (default)
- `always`: Always perform a snapshot on startup
- `never`: Skip snapshots, only stream changes
- `when_needed`: Perform snapshot if no offset exists
- `initial_only`: Perform snapshot then stop the connector
- `exported`: Use database's native export functionality (PostgreSQL 15+)

**Incremental Snapshots**: A powerful 2025 feature that allows re-snapshotting tables without stopping the connector or locking tables:

```json
{
  "incremental.snapshot.enabled": true,
  "signal.data.collection": "public.debezium_signal",
  "snapshot.max.threads": 4,
  "snapshot.fetch.size": 10000
}
```

Create a signal table in your source database:

```sql
CREATE TABLE debezium_signal (
  id VARCHAR(42) PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  data TEXT
);
```

Trigger an incremental snapshot by inserting into the signal table:

```sql
INSERT INTO debezium_signal VALUES (
  'snapshot-orders-' || NOW()::TEXT,
  'execute-snapshot',
  '{"data-collections": ["public.orders"], "type": "incremental"}'
);
```

**Heartbeat Configuration**: Enable heartbeats to ensure offset commits during low database activity:

```json
{
  "heartbeat.interval.ms": "5000",
  "heartbeat.topics.prefix": "__debezium-heartbeat"
}
```

This prevents consumer lag accumulation and ensures connectors maintain their position in the transaction log.

**Message Transformations**: Debezium supports Single Message Transforms (SMTs) to modify events before they're written to Kafka. The `ExtractNewRecordState` SMT is particularly useful as it simplifies the event structure by extracting just the "after" state of a row change, making downstream consumption easier.

**Handling Schema Changes**: Debezium tracks schema evolution through a schema history topic. This ensures connectors can correctly interpret older log entries even after table schema changes. Configure appropriate retention policies for this topic to prevent data loss.

**Performance Tuning**: For high-throughput scenarios based on 2025 production benchmarks:

```json
{
  "max.batch.size": "2048",
  "max.queue.size": "8192",
  "poll.interval.ms": "100",
  "producer.override.batch.size": "1000000",
  "producer.override.linger.ms": "500",
  "producer.override.compression.type": "lz4"
}
```

These Kafka producer overrides can reduce snapshot times by 25% or more. Monitor connector lag using JMX metrics or Kafka Connect's REST API at `/connectors/{name}/status`.

## Integrating with the Kafka Ecosystem

Debezium connectors produce events to Kafka topics, making them immediately available to the broader Kafka ecosystem. This integration enables several powerful patterns:

**Stream Processing**: Use Kafka Streams or ksqlDB to process CDC events in real-time. For example, joining order changes with customer data to build enriched materialized views.

**Data Lake Ingestion**: Connect Debezium to sink connectors that write to object storage or data warehouses, creating an automated pipeline from operational databases to analytical systems.

**Event-Driven Architecture**: CDC events can trigger downstream microservices. An order status change captured by Debezium might trigger fulfillment systems, notification services, or analytics pipelines.

**Monitoring and Governance**: Governance platforms provide visibility into Debezium topics, helping teams monitor data quality, track schema evolution, and govern access to sensitive CDC streams. Tools like Conduktor offer data masking capabilities that are particularly valuable for CDC pipelines containing PII, allowing teams to enforce privacy policies without modifying connector configurations.

## Common Patterns and Use Cases

**Database Replication**: Replicate data from operational databases to read replicas, analytics databases, or search indexes without impacting source database performance.

**Event Sourcing**: Capture all database changes as immutable events, creating an audit trail and enabling temporal queries.

**Cache Invalidation**: Propagate database changes to distributed caches in real-time, ensuring cache consistency without complex invalidation logic.

**Microservices Data Synchronization**: Share data between microservices while maintaining service autonomy. Each service consumes relevant CDC topics to maintain its own local copy of data owned by other services.

## Monitoring and Troubleshooting

Successful Debezium deployments require proper monitoring. Key metrics to track include:

- **Connector Status**: Monitor through Kafka Connect REST API (`/connectors/{name}/status`)
- **Lag**: Time difference between database transaction commit and Kafka message production
- **Snapshot Progress**: During initial snapshots, track rows processed and estimated completion time
- **Error Rates**: Failed message conversions or connection issues

Common issues and solutions:

**Replication Slot Growth**: If a connector is stopped for extended periods, PostgreSQL replication slots can accumulate WAL files, consuming disk space. Monitor slot lag and set appropriate WAL retention limits.

**Schema Registry Integration**: When using Avro or Protobuf serialization, ensure Schema Registry is properly configured and accessible to Debezium connectors.

**Network Partitions**: Debezium connectors must maintain persistent connections to both the database and Kafka. Network issues can cause connector failures; implement retry logic and alerting.

## Summary

Debezium provides a production-ready platform for implementing Change Data Capture across various database systems. By leveraging transaction logs, it captures database changes with minimal overhead while maintaining strict ordering guarantees and exactly-once semantics.

The key to successful implementation lies in understanding your specific requirements: choosing appropriate snapshot modes, configuring message transformations, and integrating with downstream consumers. When combined with Kafka's distributed architecture and ecosystem tools, Debezium enables real-time data pipelines that bridge operational and analytical systems.

Start with a single table connector in a non-production environment to understand the event format and behavior. Gradually expand to more tables, implement monitoring, and integrate with downstream systems. This incremental approach reduces risk while building team expertise with CDC patterns.

## Sources and References

- [Debezium Documentation](https://debezium.io/documentation/)
- [Debezium Connector for PostgreSQL](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)
- [PostgreSQL Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html)
- [Kafka Connect Documentation](https://kafka.apache.org/documentation/#connect)
- [Debezium Tutorial](https://debezium.io/documentation/reference/stable/tutorial.html)
- [Single Message Transforms (SMTs)](https://kafka.apache.org/documentation/#connect_transforms)
