---
title: "Kafka Log Compaction Explained"
description: "Log compaction preserves the latest value per message key. Learn how this Kafka retention policy enables CDC, state stores, and materialized views."
topics:
  - Kafka
  - Log Compaction
  - Data Retention
  - Stream Processing
  - State Management
---

# Kafka Log Compaction Explained

Apache Kafka is widely known for its ability to retain message streams for extended periods. While most users are familiar with time-based or size-based retention policies, Kafka offers a powerful alternative called log compaction. This retention mechanism serves a fundamentally different purpose: maintaining the latest state of each record rather than preserving a complete historical timeline.

## What is Kafka Log Compaction?

Log compaction is a retention policy that ensures a Kafka topic retains at least the last known value for each message key within a partition. Unlike standard deletion-based retention (which removes old data after a specified time or when a size limit is reached), compaction keeps the most recent update for each key indefinitely.

This approach transforms a Kafka topic from an append-only log of events into something closer to a table of current states. However, the log structure remains intact—compaction doesn't remove messages immediately, and it preserves message offsets so consumers can still track their position reliably.

A critical feature of log compaction is support for tombstone records. When a message with a null value is published for a given key, it signals that the key should be deleted. The compaction process will eventually remove both the tombstone and all previous messages for that key.

## How Log Compaction Works

Kafka partitions are divided into segments—immutable files that contain a portion of the log. Log compaction operates on these segments using a background cleaner thread.

The log is conceptually split into two sections:

- **Clean section**: Segments that have already been compacted, containing only the most recent value for each key
- **Dirty section**: Segments containing potentially duplicate keys that haven't been compacted yet

The cleaner thread periodically scans the dirty section, builds a hash map of the latest offset for each key, and creates new clean segments containing only the most recent records. The old segments are then deleted.

Several configuration parameters control when compaction runs:

- `min.cleanable.dirty.ratio`: The minimum ratio of dirty records to total records before compaction triggers (default 0.5)
- `segment.ms`: How long before a segment becomes eligible for compaction
- `min.compaction.lag.ms`: Minimum time a message remains uncompacted, ensuring recent messages stay available

Importantly, the active segment (currently being written to) is never compacted, ensuring new data is immediately available to consumers.

## Log Compaction vs Time-Based Retention

Standard Kafka topics use deletion-based retention, configured with `retention.ms` or `retention.bytes`. Messages older than the retention period are deleted regardless of their content.

Log compaction, enabled with `cleanup.policy=compact`, takes a different approach. It retains messages based on key uniqueness rather than age. This means:

- **Time-based retention**: Appropriate for event streams where historical order matters (clickstreams, logs, audit trails)
- **Log compaction**: Appropriate for state or entity updates where only the current value matters (user profiles, product catalogs, configuration data)

You can also combine both policies with `cleanup.policy=compact,delete`, which compacts the log while also removing old segments that exceed retention limits.

## Common Use Cases

Log compaction enables several important patterns in data streaming:

### Change Data Capture (CDC)

When capturing database changes into Kafka, each message represents a row update keyed by the primary key. Log compaction ensures the topic always contains the latest state of each row without storing the complete change history indefinitely.

For example, consider a `users` table synced to Kafka:

```
Key: user_123 | Value: {"name": "Alice", "email": "alice@example.com", "updated_at": "2025-01-15"}
Key: user_123 | Value: {"name": "Alice", "email": "alice@newmail.com", "updated_at": "2025-02-20"}
Key: user_123 | Value: {"name": "Alice Smith", "email": "alice@newmail.com", "updated_at": "2025-03-10"}
```

After compaction, only the final record remains, representing the current state of user_123.

### State Stores and Materialized Views

Applications that build local state from Kafka topics benefit from compaction. When restarting or rebalancing, they can rebuild state by consuming only the latest value for each key rather than processing the entire history.

### Configuration Management

Distributed systems often use compacted topics to share configuration across services. Each configuration key holds its current value, and services can reconstruct the full configuration by reading the compacted topic.

## Configuring Log Compaction

To enable log compaction on a topic, set the cleanup policy:

```
cleanup.policy=compact
```

Additional important configurations include:

- `min.cleanable.dirty.ratio`: Controls compaction frequency (lower values mean more frequent compaction but higher resource usage)
- `delete.retention.ms`: How long tombstone records are retained before final deletion (default 24 hours)
- `max.compaction.lag.ms`: Maximum time before a message must be compacted
- `segment.ms` and `segment.bytes`: Control segment size and rotation, affecting compaction granularity

It's important to understand that compaction is not immediate. Messages remain in the log until the cleaner thread runs and processes the segments containing them.

## Log Compaction in Data Streaming Architectures

Log compaction plays a crucial role in stateful stream processing frameworks like Kafka Streams and Apache Flink.

Kafka Streams uses compacted changelog topics to back state stores. When a stream processing application updates local state (such as an aggregation or join table), it writes changes to a compacted topic. If the application fails or restarts, it can rebuild its state by consuming this topic. Since the topic is compacted, restoration is faster—only the latest value for each key needs to be processed.

This pattern enables exactly-once processing semantics and fault-tolerant stateful operations without requiring external databases. The compacted topic serves as both a changelog and a source of truth for application state.

Event sourcing architectures also leverage log compaction. While the complete event history might be preserved in one topic, a compacted topic can maintain the current projection or materialized view derived from those events.

## Monitoring and Troubleshooting

Monitoring log compaction is essential to ensure it's working correctly and not falling behind.

Key metrics to watch include:

- `kafka.log.LogCleanerManager.max-dirty-percent`: Shows how much of the log is dirty and eligible for compaction
- `kafka.log.LogCleaner.cleaner-recopy-percent`: Indicates compaction efficiency
- Segment count and size per partition

Common issues include:

- **Compaction lag**: If the dirty ratio stays high, compaction may not be keeping up. Increase cleaner threads or adjust `min.cleanable.dirty.ratio`
- **Missing keys**: Messages without keys cannot be compacted. Ensure all messages include keys
- **Unexpected deletion**: Check for tombstone records if data disappears unexpectedly

Platforms like Conduktor provide visibility into topic configurations, compaction metrics, and data retention policies across your Kafka clusters. This makes it easier to identify topics with compaction enabled, monitor cleaner performance, and troubleshoot retention issues without manually querying each broker.

## Summary

Kafka log compaction is a powerful retention mechanism that maintains the latest state for each message key rather than preserving a complete time-ordered history. It transforms Kafka topics into durable, fault-tolerant state stores that support use cases like change data capture, configuration management, and stateful stream processing.

Understanding the mechanics of compaction—how the cleaner thread operates on segments, when compaction triggers, and how tombstones enable deletion—is essential for using this feature effectively. While compaction isn't appropriate for all use cases, it's invaluable when you need a distributed, scalable way to maintain current state in a data streaming architecture.

By configuring compaction correctly and monitoring its performance, you can build robust systems that leverage Kafka not just as a message broker, but as a foundational state management layer.

## Sources and References

1. [Apache Kafka Documentation: Log Compaction](https://kafka.apache.org/documentation/#compaction) - Official Kafka documentation detailing compaction mechanics and configuration
2. [Confluent: Log Compaction Highlights](https://www.confluent.io/blog/kafka-log-compaction-demystified/) - In-depth explanation of how log compaction works under the hood
3. Narkhede, N., Shapira, G., & Palino, T. (2017). *Kafka: The Definitive Guide*. O'Reilly Media. - Comprehensive book covering Kafka internals including log compaction
4. Kleppmann, M. (2017). *Designing Data-Intensive Applications*. O'Reilly Media. - Context on event sourcing and state management patterns
5. [Kafka Streams Documentation: State Stores](https://kafka.apache.org/documentation/streams/developer-guide/processor-api#state-stores) - How Kafka Streams uses compacted topics for state management
