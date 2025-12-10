---
title: "Maintaining Iceberg Tables: Compaction and Cleanup"
description: "Maintain Apache Iceberg tables through compaction, snapshot expiration, and orphan cleanup. Best practices for storage optimization and metadata management."
topics:
  - Apache Iceberg
  - Table Maintenance
  - Compaction
  - Data Management
  - Storage Optimization
---

# Maintaining Iceberg Tables: Compaction and Cleanup

Apache Iceberg's time-travel capabilities and transactional guarantees come with a maintenance cost: small files, expired snapshots, and orphan data files can accumulate over time. Without proper maintenance, these artifacts degrade query performance, inflate storage costs, and complicate metadata management. This article explores the essential maintenance procedures that keep Iceberg tables healthy and performant in production environments.

## Understanding Iceberg's Maintenance Challenges

### Small File Problem

Iceberg tables can accumulate numerous small files through incremental writes, streaming ingestion, or high-frequency updates. Each insert operation typically creates new data files rather than modifying existing ones, following Iceberg's immutable file design. While this approach enables ACID transactions and time travel, it leads to several performance issues:

- **Query overhead**: Reading hundreds of small files is slower than reading fewer large files due to I/O overhead and metadata processing
- **Planning latency**: Query planning time increases with the number of files the optimizer must evaluate
- **Cloud storage costs**: Object storage systems often charge per-request, making small files expensive to read

### Metadata Growth

Every commit to an Iceberg table creates a new snapshot, capturing the table's state at that point in time. Each snapshot references manifest files, which in turn reference data files. Over time, this metadata accumulates:

- Snapshot history grows linearly with commit frequency
- Manifest files accumulate faster in tables with frequent schema evolution or partition changes
- Metadata JSON files can reach sizes that impact table loading performance

### Orphan Files

Orphan files are data files present in table storage but not referenced by any snapshot. They arise from:

- **Failed writes**: Transactions that write files but fail before committing metadata
- **Concurrent operations**: Race conditions in distributed systems
- **Improper cleanup**: Manual interventions or external tools modifying table storage

Orphan files waste storage but don't affect correctness since Iceberg never reads unreferenced files.

## Compaction: Consolidating Small Files

Compaction merges small data files into larger ones, optimizing file sizes for query performance. Iceberg provides two compaction strategies: **bin-packing** and **sorting**.

### Bin-Packing Compaction

Bin-packing groups small files together without changing data order, making it ideal for tables where write order matters or when you want a fast compaction process.

```sql
-- Spark SQL: Rewrite small files using bin-packing
CALL catalog.system.rewrite_data_files(
  table => 'db.events',
  strategy => 'binpack',
  options => map(
    'target-file-size-bytes', '536870912',  -- 512 MB target
    'min-input-files', '5'                   -- Only rewrite partitions with 5+ files
  )
);
```

```python
# PySpark: Programmatic compaction with filtering
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("compaction").getOrCreate()

# Compact specific partitions
spark.sql("""
  CALL catalog.system.rewrite_data_files(
    table => 'db.events',
    strategy => 'binpack',
    where => 'event_date >= current_date() - 7'
  )
""")
```

### Sort-Based Compaction

Sort-based compaction rewrites data in a sorted order, improving query performance through better data clustering and predicate pushdown. This is particularly valuable for tables with frequent range queries.

```sql
-- Compact and sort by frequently queried columns
CALL catalog.system.rewrite_data_files(
  table => 'db.user_events',
  strategy => 'sort',
  sort_order => 'user_id, event_timestamp',
  options => map('target-file-size-bytes', '536870912')
);
```

### Compaction Best Practices

- **Schedule during low-traffic periods**: Compaction is resource-intensive and benefits from dedicated compute resources
- **Partition-aware compaction**: Use `where` clauses to compact only recently modified partitions
- **Monitor file sizes**: Set target file sizes based on your query patterns (typically 256 MB to 1 GB)
- **Combine with snapshot expiration**: Compact first, then expire snapshots to maximize cleanup

## Expiring Snapshots

Snapshot expiration removes old snapshots and their associated metadata files, reclaiming storage and preventing unbounded metadata growth.

```sql
-- Expire snapshots older than 7 days
CALL catalog.system.expire_snapshots(
  table => 'db.events',
  older_than => TIMESTAMP '2025-11-30 00:00:00',
  retain_last => 10  -- Always keep at least 10 snapshots
);
```

```python
# PySpark: Expire snapshots with retention period
spark.sql("""
  CALL catalog.system.expire_snapshots(
    table => 'db.events',
    older_than => current_timestamp() - INTERVAL '7' DAY,
    retain_last => 5,
    max_concurrent_deletes => 10
  )
""")
```

### Retention Considerations

- **Compliance requirements**: Ensure retention periods satisfy audit and regulatory needs
- **Time-travel dependencies**: Don't expire snapshots that downstream consumers rely on for incremental processing
- **Snapshot metadata size**: Check metadata directory sizes to determine aggressive expiration schedules

```sql
-- Query snapshot history to understand retention needs
SELECT
  snapshot_id,
  committed_at,
  operation,
  summary
FROM db.events.snapshots
ORDER BY committed_at DESC
LIMIT 20;
```

## Removing Orphan Files

Orphan file removal identifies and deletes files not referenced by any valid snapshot. This operation is safe only after ensuring no concurrent writes are occurring.

```sql
-- Remove orphan files older than 3 days (safety margin)
CALL catalog.system.remove_orphan_files(
  table => 'db.events',
  older_than => TIMESTAMP '2025-12-04 00:00:00',
  location => 's3://bucket/warehouse/db/events'
);
```

```python
# PySpark: Dry-run to preview orphan files
result = spark.sql("""
  CALL catalog.system.remove_orphan_files(
    table => 'db.events',
    older_than => current_timestamp() - INTERVAL '3' DAY,
    dry_run => true
  )
""")

result.show()
```

### Safety Guidelines

- **Use safety margins**: Only delete files older than your longest-running transaction or write operation
- **Run during maintenance windows**: Ensure no active writers exist when removing orphans
- **Test with dry-run**: Always preview deletions before executing
- **Backup metadata**: Maintain metadata backups before aggressive cleanup operations

## Streaming Ecosystem Integration

Iceberg maintenance becomes more critical in streaming environments where continuous writes amplify small file and metadata growth.

### Spark Structured Streaming Maintenance

```python
from pyspark.sql.streaming import StreamingQuery

# Streaming write with periodic compaction trigger
query = (
    stream_df
    .writeStream
    .format("iceberg")
    .outputMode("append")
    .option("checkpointLocation", "s3://bucket/checkpoints/events")
    .trigger(processingTime="5 minutes")
    .toTable("db.events")
)

# Separate maintenance job
def maintain_table():
    spark.sql("""
      CALL catalog.system.rewrite_data_files(
        table => 'db.events',
        strategy => 'binpack',
        where => 'event_hour >= current_timestamp() - INTERVAL 2 HOUR'
      )
    """)

# Schedule maintenance every hour
from apscheduler.schedulers.background import BackgroundScheduler
scheduler = BackgroundScheduler()
scheduler.add_job(maintain_table, 'interval', hours=1)
scheduler.start()
```

### Flink Integration

Apache Flink users can configure automatic compaction through table properties:

```sql
CREATE TABLE events (
  event_id STRING,
  user_id BIGINT,
  event_time TIMESTAMP(3),
  payload STRING
) WITH (
  'connector' = 'iceberg',
  'catalog-name' = 'iceberg_catalog',
  'write.upsert.enabled' = 'true',
  'write.target-file-size-bytes' = '134217728',  -- 128 MB
  'commit.manifest.target-size-bytes' = '8388608'  -- 8 MB manifests
);
```

### Governance and Visibility

In organizations managing multiple Iceberg tables across streaming pipelines, visibility into table health becomes critical. Governance platforms provide capabilities that help data teams:

- **Monitor table metrics**: Track file counts, average file sizes, and snapshot growth across all tables
- **Audit maintenance operations**: Log compaction jobs, snapshot expirations, and orphan cleanups for compliance
- **Alert on anomalies**: Detect tables with excessive small files or runaway metadata growth
- **Enforce policies**: Automatically trigger maintenance when tables exceed defined thresholds

This centralized visibility is especially valuable when Iceberg tables are populated by diverse streaming sources (Kafka Connect, Flink, Spark Streaming) where maintenance responsibilities span multiple teams.

## Maintenance Automation and Scheduling

Production Iceberg deployments require automated maintenance schedules to prevent degradation.

### Airflow DAG Example

```python
from airflow import DAG
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-platform',
    'depends_on_past': False,
    'start_date': datetime(2025, 12, 1),
    'retries': 2,
    'retry_delay': timedelta(minutes=5)
}

dag = DAG(
    'iceberg_maintenance',
    default_args=default_args,
    schedule_interval='0 2 * * *',  # Daily at 2 AM
    catchup=False
)

compact_task = SparkSubmitOperator(
    task_id='compact_events_table',
    application='/path/to/compact.py',
    conf={
        'spark.sql.catalog.iceberg': 'org.apache.iceberg.spark.SparkCatalog',
        'spark.sql.catalog.iceberg.type': 'hive'
    },
    dag=dag
)

expire_task = SparkSubmitOperator(
    task_id='expire_snapshots',
    application='/path/to/expire.py',
    dag=dag
)

orphan_task = SparkSubmitOperator(
    task_id='remove_orphans',
    application='/path/to/orphan_cleanup.py',
    dag=dag
)

compact_task >> expire_task >> orphan_task
```

### Maintenance Sequence

Always perform maintenance operations in this order:

1. **Compaction**: Consolidate small files first
2. **Snapshot expiration**: Remove old snapshots that reference old small files
3. **Orphan cleanup**: Delete unreferenced files after snapshots are expired

This sequence ensures maximum storage reclamation while maintaining data integrity.

## Summary

Maintaining Iceberg tables through compaction, snapshot expiration, and orphan file cleanup is essential for production deployments. Compaction addresses the small file problem through bin-packing or sort-based strategies, improving query performance and reducing I/O overhead. Snapshot expiration prevents unbounded metadata growth while respecting time-travel requirements and compliance needs. Orphan file removal reclaims wasted storage from failed writes and concurrent operations.

In streaming environments, maintenance becomes more critical as continuous writes amplify these challenges. Integrating maintenance procedures into your orchestration platform and leveraging governance tools for visibility ensures tables remain healthy at scale. By following the best practices and automation patterns outlined here, data platform teams can maintain Iceberg tables efficiently while optimizing for both performance and cost.

## Sources and References

- [Apache Iceberg Documentation: Maintenance](https://iceberg.apache.org/docs/latest/maintenance/)
- [Apache Iceberg: Spark Procedures](https://iceberg.apache.org/docs/latest/spark-procedures/)
- [Netflix Tech Blog: Managing Apache Iceberg Tables](https://netflixtechblog.com/apache-iceberg-managing-data-files-at-scale-7465e2f5d9e9)
- [Tabular: Iceberg Table Maintenance Best Practices](https://tabular.io/blog/table-maintenance/)
- [Apache Iceberg GitHub: Maintenance Actions](https://github.com/apache/iceberg/tree/master/spark/v3.3/spark/src/main/java/org/apache/iceberg/actions)
