---
title: "Streaming to Lakehouse Tables: Delta Lake, Iceberg, and Hudi"
description: "Building streaming pipelines that write to modern table formats with ACID guarantees, schema evolution, and real-time queryability."
topics:
  - Lakehouse
  - Streaming Architecture
  - Apache Iceberg
---

# Streaming to Lakehouse Tables: Delta Lake, Iceberg, and Hudi

## Outline

1. **Introduction: The Streaming Lakehouse**
   - Evolution from batch to streaming lakehouses
   - Why table formats matter for real-time data

2. **Table Formats for Streaming Workloads**
   - ACID transactions in streaming contexts
   - Time travel and versioning capabilities
   - Concurrent reads and writes

3. **Delta Lake Streaming Patterns**
   - Structured Streaming integration
   - Append, merge, and upsert operations
   - Managing late-arriving data

4. **Apache Iceberg for Stream Processing**
   - Flink and Spark streaming integration
   - Watermarking and event-time processing
   - Hidden partitioning advantages

5. **Apache Hudi's Streaming Capabilities**
   - Copy-on-write vs. merge-on-read
   - Near real-time data ingestion
   - Incremental processing patterns

6. **Operational Considerations**
   - Schema evolution in streaming pipelines
   - Compaction strategies and file management
   - Partition management for time-series data
   - Exactly-once semantics

7. **Governance and Data Quality**
   - Quality gates before the lakehouse
   - Monitoring streaming table health
   - Lineage and observability

---

## Introduction: The Streaming Lakehouse

The lakehouse architecture has fundamentally changed how organizations handle analytics at scale, combining the flexibility of data lakes with the reliability of data warehouses. While early lakehouses were primarily batch-oriented, modern table formats—Delta Lake, Apache Iceberg, and Apache Hudi—were built with streaming workloads in mind.

Streaming writes to lakehouse tables enable real-time analytics without sacrificing data quality or consistency. Unlike raw file writes to object storage, table formats provide ACID guarantees, schema enforcement, and time travel capabilities that make streaming data immediately queryable and trustworthy.

The key innovation is treating streaming data as a continuous flow of incremental updates to versioned tables, rather than as separate batch snapshots. This approach bridges the gap between real-time processing and historical analytics, allowing organizations to query both fresh and historical data through the same interface.

## Table Formats for Streaming Workloads

Modern table formats share core capabilities that make them suitable for streaming:

**ACID Transactions**: Every streaming write is atomic and isolated. If a micro-batch fails mid-write, readers never see partial data. Delta Lake uses optimistic concurrency control with transaction logs, while Iceberg uses snapshot isolation with manifest files. This ensures data consistency even when multiple streaming jobs write to the same table concurrently.

**Time Travel and Versioning**: Each streaming write creates a new table version. You can query data as of any point in time, enabling powerful debugging ("What did this table look like when the anomaly occurred?") and regulatory compliance. This is particularly valuable for streaming workloads where understanding data lineage matters.

**Concurrent Operations**: Streaming writers append data while analysts query the table simultaneously. Table formats coordinate these operations without locking. Readers see consistent snapshots while writers continue processing events. This concurrent access pattern is essential for real-time analytics dashboards fed by streaming pipelines.

**Hidden Partitioning**: Particularly in Iceberg, partition values don't appear in query predicates—the engine handles partition pruning automatically. This decouples physical layout from logical queries, allowing partition schemes to evolve as data volumes grow without rewriting queries.

## Delta Lake Streaming Patterns

Delta Lake integrates natively with Spark Structured Streaming, making it a natural choice for Spark-based streaming pipelines:

**Append Mode**: The simplest pattern. Each micro-batch appends new rows to the Delta table. Checkpoint locations track progress, ensuring exactly-once processing even after failures.

**Merge Operations**: For CDC (change data capture) streams or deduplication, Delta Lake's MERGE operation handles late-arriving updates, inserting new records and updating existing ones based on a key. The transaction log ensures atomicity—either the entire micro-batch commits or none of it does.

**Managing Late Data**: Delta Lake's MERGE operation naturally handles out-of-order events. Combined with watermarking, you can control how long to wait for late arrivals. Events arriving beyond the watermark threshold are dropped, preventing indefinite state growth.

## Apache Iceberg for Stream Processing

Apache Iceberg's architecture makes it particularly well-suited for streaming scenarios where data freshness and query performance must coexist:

**Flink Integration**: Iceberg has first-class Apache Flink support, enabling sophisticated event-time processing with features like watermarking and equality-based upserts.

**Watermarking and Event-Time Processing**: Iceberg preserves event-time semantics during writes. Flink's watermarks control when data becomes visible to readers, ensuring downstream consumers only see data that's sufficiently "complete" according to event time, not processing time.

**Hidden Partitioning Advantages**: Iceberg's hidden partitioning is particularly valuable for streaming workloads. You can partition by time (hours, days) without exposing this to queries. Streaming writers automatically route events to the correct partition, and queries prune partitions automatically based on time predicates.

**Snapshot Isolation**: Each Iceberg write creates a new snapshot. Streaming jobs can commit small, frequent snapshots (every few seconds), while readers see consistent point-in-time views. This isolation prevents "read-your-own-writes" anomalies in real-time dashboards.

## Apache Hudi's Streaming Capabilities

Apache Hudi (Hadoop Upserts Deletes and Incrementals) was designed specifically for streaming ingestion with near real-time query capabilities:

**Copy-on-Write vs. Merge-on-Read**: Hudi offers two table types with different streaming trade-offs:

- **Copy-on-Write (CoW)**: Updates rewrite entire Parquet files. Streaming writes have higher latency but queries are fast. Suitable for read-heavy workloads with moderate update rates.

- **Merge-on-Read (MoR)**: Updates append to delta logs, merged during reads. Streaming writes are fast, but queries pay a merge cost. Ideal for write-heavy streaming with lower query frequency.

**Near Real-Time Ingestion**: Hudi's DeltaStreamer utility provides a complete streaming ingestion framework that continuously ingests from Kafka, applies transformations, and writes to Hudi with configurable commit intervals.

**Incremental Processing Patterns**: Hudi excels at incremental processing—reading only changed data since a checkpoint. This enables streaming-to-streaming patterns where downstream jobs consume incremental changes from upstream Hudi tables.

## Operational Considerations

**Schema Evolution**: Streaming pipelines must handle schema changes gracefully. All three table formats support adding columns, but streaming jobs need explicit configuration:

- **Delta Lake**: Set `mergeSchema` option to automatically merge new columns during streaming writes.
- **Iceberg**: Schema updates are versioned like data. Streaming writers can evolve schemas without downtime.
- **Hudi**: Configure `hoodie.schema.on.read.enable` to handle schema evolution during reads.

**Compaction and File Management**: Streaming writes create many small files. Compaction merges them into optimal sizes:

- **Delta Lake**: Run `OPTIMIZE` commands periodically or use auto-compaction with `autoOptimize`.
- **Iceberg**: Flink and Spark can trigger compaction after write commits with configurable target file sizes.
- **Hudi**: Inline or asynchronous compaction for MoR tables.

**Partition Management**: For time-series streaming data, partition by time (hour/day) to enable efficient pruning and retention. Old partitions can be dropped efficiently without scanning the entire table.

**Exactly-Once Semantics**: Achieving end-to-end exactly-once requires coordination between source, processing, and sink:

1. **Idempotent Writes**: Use primary keys and MERGE operations to handle duplicate deliveries.
2. **Checkpointing**: Spark/Flink checkpoints track Kafka offsets and output states atomically.
3. **Transactional Commits**: Table formats ensure atomic commits—no partial writes are visible.

The checkpoint location and table format's transaction log together guarantee exactly-once processing.

## Governance and Data Quality

**Quality Gates Before the Lakehouse**: Streaming pipelines should enforce data quality *before* writing to lakehouse tables. Tools like Conduktor provide data governance capabilities that validate schemas, check data quality rules, and enforce compliance policies in real-time as data flows through Kafka.

By validating data upstream in the streaming platform, you prevent bad data from polluting the lakehouse. This "shift-left" approach to governance means lakehouse tables remain clean and trustworthy, reducing the need for downstream data cleaning.

**Monitoring Streaming Table Health**: Key metrics to track:

- **Write Latency**: Time from event creation to table commit. Spikes indicate backpressure or resource constraints.
- **File Count**: Too many small files degrades query performance. Monitor files-per-partition.
- **Schema Drift**: Unexpected schema changes can break downstream consumers. Alert on schema evolution events.
- **Data Freshness**: Time lag between event time and availability in the table. Essential for SLA monitoring.

**Lineage and Observability**: Understanding data flow through streaming pipelines is critical:

- Track which source topics feed which tables
- Monitor transformation logic versions
- Correlate data quality issues back to source systems
- Audit who reads streaming tables and when

Modern data catalogs integrate with table formats to provide automatic lineage tracking, showing how streaming data flows from sources through transformations into lakehouse tables and ultimately into analytics.

## Conclusion

Streaming to lakehouse tables with Delta Lake, Apache Iceberg, and Apache Hudi represents a maturation of real-time data architecture. These table formats provide the ACID guarantees, schema evolution, and query performance necessary for production streaming workloads.

Delta Lake offers the tightest Spark integration with simple append and merge patterns. Iceberg provides sophisticated hidden partitioning and multi-engine support, particularly strong with Flink. Hudi excels at upsert-heavy workloads with its incremental processing capabilities.

Regardless of format choice, success requires attention to operational details: schema evolution strategies, compaction policies, partition management, and exactly-once semantics. Most critically, data quality must be enforced upstream—before data reaches the lakehouse—to ensure streaming tables remain reliable sources of truth.

The streaming lakehouse is no longer emerging technology—it's production-ready architecture powering real-time analytics at scale.

## Sources and References

- [Delta Lake Official Documentation](https://docs.delta.io/latest/index.html) - Transaction log protocol and streaming patterns
- [Apache Iceberg Specification](https://iceberg.apache.org/spec/) - Table format specification and design principles
- [Apache Hudi Documentation](https://hudi.apache.org/docs/overview) - Streaming ingestion and incremental processing patterns
- [Apache Spark Structured Streaming](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html) - Streaming engine integration with table formats
- [The Lakehouse Architecture](https://www.databricks.com/research/lakehouse-a-new-generation-of-open-platforms) - Research paper on unified data architecture
