---
title: "Iceberg Table Architecture: Metadata and Snapshots"
description: "Understand Apache Iceberg's layered architecture, from metadata files to snapshot isolation. Learn how Iceberg's design enables ACID transactions, time travel, and efficient data management at scale for modern data lakehouses."
topics:
  - Apache Iceberg
  - Table Format
  - Metadata
  - Snapshots
  - Data Lakehouse
---

# Iceberg Table Architecture: Metadata and Snapshots

Apache Iceberg has emerged as a leading table format for data lakehouses, addressing fundamental limitations in traditional data lake architectures. At its core, Iceberg's power comes from its sophisticated metadata layer that enables ACID transactions, snapshot isolation, and schema evolution—capabilities previously available only in proprietary data warehouses.

This article explores Iceberg's architectural components, focusing on how metadata layers and snapshots work together to provide reliable, scalable data management for modern data platforms.

## The Three-Layer Metadata Architecture

Iceberg's architecture is built on three distinct metadata layers that work together to track table state and data files:

```
┌─────────────────────────────────────┐
│     Catalog (Table Pointer)         │
│  Points to current metadata file    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Metadata File (JSON)           │
│  - Current snapshot                 │
│  - Schema history                   │
│  - Partition spec                   │
│  - Manifest list pointer            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Manifest List (Avro)           │
│  Lists all manifest files for       │
│  this snapshot                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Manifest Files (Avro)          │
│  Track individual data files with:  │
│  - File paths                       │
│  - Partition values                 │
│  - Row counts                       │
│  - Column statistics                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Data Files (Parquet/ORC)       │
│  Actual table data                  │
└─────────────────────────────────────┘
```

### Catalog Layer

The catalog serves as the entry point to an Iceberg table, maintaining a pointer to the current metadata file. Popular catalog implementations include Hive Metastore, AWS Glue, Nessie, and REST catalogs. The catalog's atomic update mechanism ensures only one metadata file is considered "current," preventing split-brain scenarios during concurrent writes.

### Metadata Files

Each metadata file is a JSON document containing:

- **Current snapshot reference**: Points to the active table state
- **Snapshot history**: List of all previous snapshots with timestamps
- **Schema**: Current and historical table schemas
- **Partition spec**: How the table is partitioned (supports evolution)
- **Sort order**: Optional ordering specification for data optimization
- **Table properties**: Configuration and operational metadata

Metadata files are immutable and versioned. Each write operation creates a new metadata file, enabling time travel to any previous table state.

### Manifest Lists and Manifest Files

The manifest list (Avro format) contains references to all manifest files for a given snapshot. Each manifest file tracks a subset of data files along with:

- File-level statistics (row counts, column bounds, null counts)
- Partition values for partitioned tables
- File size and format information

This hierarchical structure enables efficient query planning. Engines can read manifest files to determine which data files are relevant for a query without scanning the entire dataset—a critical optimization for large tables with millions of files.

## Snapshot Isolation and ACID Transactions

Snapshots are the cornerstone of Iceberg's transactional guarantees. Each snapshot represents an immutable, consistent view of the table at a specific point in time.

### How Snapshots Work

When a write operation occurs:

1. New data files are written to object storage
2. New manifest files are created describing these data files
3. A new manifest list aggregates all relevant manifests
4. A new metadata file is created with updated snapshot information
5. The catalog pointer is atomically updated to the new metadata file

If the atomic catalog update fails (due to concurrent modification), the write operation is retried with the latest table state, ensuring serializable isolation.

### Snapshot Benefits

**Time Travel**: Query historical table states by specifying a snapshot ID or timestamp:

```sql
SELECT * FROM orders
FOR SYSTEM_TIME AS OF '2025-01-15 10:00:00';
```

**Rollback**: Revert to previous snapshots instantly without data movement:

```sql
CALL catalog.system.rollback_to_snapshot('orders', 12345678901234);
```

**Incremental Processing**: Read only changes between snapshots for efficient ETL:

```sql
SELECT * FROM orders
FOR SYSTEM_VERSION AS OF 100
WHERE _iceberg_snapshot_id > 99;
```

## Schema Evolution and Partition Evolution

Unlike traditional formats, Iceberg supports safe schema and partition evolution without requiring full table rewrites.

### Schema Evolution

Iceberg tracks schema changes with unique field IDs that remain constant even when columns are renamed or reordered. Supported operations include:

- Add columns (anywhere in the schema)
- Drop columns
- Rename columns
- Update column types (with compatible promotions)
- Reorder columns

Each schema change creates a new schema version in the metadata file, but existing data files remain valid. Query engines use the schema evolution history to correctly read older files.

### Partition Evolution

Partition specifications can evolve over time. For example, you might start with daily partitioning and later switch to hourly:

```sql
-- Initial partition spec
ALTER TABLE events
SET PARTITION SPEC (day(event_time));

-- Evolve to hourly partitioning
ALTER TABLE events
SET PARTITION SPEC (hour(event_time));
```

Iceberg maintains partition evolution history, ensuring queries correctly apply partition filters regardless of when data was written.

## Streaming Ecosystem Integration

Iceberg's architecture is well-suited for streaming data ingestion, providing exactly-once semantics and low-latency visibility of new data.

### Kafka and Flink Integration

Apache Flink provides native Iceberg sink connectors that leverage snapshots for exactly-once processing:

```java
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

// Enable checkpointing for exactly-once
env.enableCheckpointing(60000);

DataStream<RowData> stream = env
    .addSource(new FlinkKafkaConsumer<>("events-topic", schema, properties));

TableLoader tableLoader = TableLoader.fromHadoopTable("s3://bucket/warehouse/events");

FlinkSink.forRowData(stream)
    .tableLoader(tableLoader)
    .distributionMode(DistributionMode.HASH)
    .writeParallelism(4)
    .build();
```

Each Flink checkpoint triggers an Iceberg commit, creating a new snapshot. If the job fails and restarts from a checkpoint, Iceberg's atomic commits prevent duplicate data.

### Streaming Read Patterns

Iceberg supports streaming reads through incremental snapshots:

- **Micro-batch streaming**: Poll for new snapshots at regular intervals
- **Continuous streaming**: Subscribe to catalog notifications for new commits
- **CDC patterns**: Use row-level deletes and position deletes for change data capture

Tools like Apache Flink, Apache Spark Structured Streaming, and Kafka Connect can consume Iceberg tables incrementally, enabling real-time analytics pipelines.

### Governance and Visibility

When building streaming pipelines with Iceberg, data governance becomes critical. Streaming management tools provide visibility into Kafka topics feeding Iceberg tables, enabling teams to track data lineage from Kafka topics to Iceberg snapshots, monitor schema compatibility between producers and Iceberg schemas, enforce data quality rules before commits, and audit access patterns across streaming and batch consumers. This governance layer ensures that the flexibility of Iceberg's architecture doesn't compromise data quality or compliance requirements.

## Metadata Optimization and Maintenance

While Iceberg's metadata architecture provides powerful capabilities, it requires periodic maintenance to prevent metadata bloat.

### Snapshot Expiration

Old snapshots should be periodically expired to remove unreferenced data and manifest files:

```sql
CALL catalog.system.expire_snapshots(
    table => 'orders',
    older_than => TIMESTAMP '2025-01-01 00:00:00',
    retain_last => 100
);
```

This operation:
- Removes metadata files for expired snapshots
- Deletes unreferenced manifest files
- Marks unreferenced data files for deletion (actual deletion happens during orphan file cleanup)

### Manifest File Compaction

As tables accumulate many small manifest files, query planning can slow down. Manifest compaction consolidates small manifests:

```sql
CALL catalog.system.rewrite_manifests('orders');
```

### Orphan File Cleanup

Failed writes can leave orphaned data files. Periodic cleanup removes these files:

```sql
CALL catalog.system.remove_orphan_files(
    table => 'orders',
    older_than => TIMESTAMP '2025-01-01 00:00:00'
);
```

### Metadata Caching

Query engines cache manifest files and statistics to avoid repeated reads. Understanding cache behavior is crucial for performance tuning in high-throughput environments.

## Performance Considerations

Iceberg's metadata architecture directly impacts query performance:

**Partition Pruning**: Manifest files contain partition statistics, enabling engines to skip entire manifests during query planning.

**Column Statistics**: Min/max values and null counts allow predicate pushdown without reading data files.

**Manifest Filtering**: When only specific partitions are modified, Iceberg reuses unchanged manifest files across snapshots, reducing metadata overhead.

**Vectorized Reads**: Manifest files in Avro format support efficient vectorized reading for large-scale query planning.

For large tables (billions of rows, millions of files), proper partition design and regular metadata maintenance are essential for maintaining sub-second query planning.

## Summary

Apache Iceberg's metadata architecture represents a fundamental shift in how data lakes handle table semantics. By separating metadata into distinct layers—catalog, metadata files, manifest lists, and manifest files—Iceberg provides:

- **ACID transactions** through atomic catalog updates and immutable snapshots
- **Snapshot isolation** enabling time travel and concurrent read/write workloads
- **Schema and partition evolution** without data rewrites
- **Efficient query planning** through hierarchical metadata and statistics
- **Streaming integration** with exactly-once semantics for real-time pipelines

Understanding these architectural components is essential for data engineers building modern data platforms. The metadata layer isn't just an implementation detail—it's the foundation that enables Iceberg to deliver warehouse-like reliability on data lake infrastructure.

As organizations adopt streaming-first architectures with tools like Kafka and Flink, Iceberg's snapshot model provides the transactional guarantees needed for production-grade real-time analytics.

## Sources and References

- [Apache Iceberg Official Documentation - Table Spec](https://iceberg.apache.org/spec/)
- [Apache Iceberg Official Documentation - Metadata](https://iceberg.apache.org/docs/latest/metadata/)
- [Netflix Technology Blog - Iceberg: A Fast Table Format](https://netflixtechblog.com/iceberg-tables-turning-the-database-inside-out-11e8b91f5677)
- [Apache Flink Documentation - Iceberg Connector](https://nightlies.apache.org/flink/flink-docs-master/docs/connectors/table/iceberg/)
- [Tabular Blog - Understanding Iceberg Snapshots](https://tabular.io/blog/how-iceberg-snapshots-work/)
- [Dremio Blog - Iceberg Metadata Optimization](https://www.dremio.com/blog/apache-iceberg-metadata-optimization/)
