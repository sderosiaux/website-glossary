---
title: "Migrating to Apache Iceberg from Hive or Parquet"
description: "Learn how to successfully migrate your existing Hive tables and Parquet datasets to Apache Iceberg. This guide covers migration strategies, data conversion techniques, and best practices for transitioning to a modern lakehouse architecture with minimal downtime."
topics:
  - Apache Iceberg
  - Data Migration
  - Hive
  - Parquet
  - Data Lakehouse
---

# Migrating to Apache Iceberg from Hive or Parquet

Apache Iceberg has emerged as the leading table format for modern data lakehouses, offering features like ACID transactions, time travel, schema evolution, and partition evolution that traditional Hive tables and raw Parquet files cannot provide. Migrating to Iceberg unlocks these capabilities while maintaining compatibility with your existing query engines and data infrastructure.

This guide explores proven migration strategies, practical conversion techniques, and critical considerations for data engineers and architects planning an Iceberg migration.

## Table of Contents

1. [Understanding the Migration Landscape](#understanding-the-migration-landscape)
2. [Migration Strategies](#migration-strategies)
3. [Migrating Hive Tables to Iceberg](#migrating-hive-tables-to-iceberg)
4. [Converting Parquet Datasets to Iceberg](#converting-parquet-datasets-to-iceberg)
5. [Streaming Integration During Migration](#streaming-integration-during-migration)
6. [Validation and Testing](#validation-and-testing)
7. [Best Practices and Considerations](#best-practices-and-considerations)

## Understanding the Migration Landscape

Before initiating a migration, assess your current state and requirements:

**From Hive Tables:**
- Existing Hive metastore integration
- Partition structures and naming conventions
- Table statistics and metadata
- Query patterns and access frequencies
- Downstream dependencies on Hive-specific features

**From Raw Parquet:**
- File organization and directory structure
- Partition schemes (if any)
- Schema consistency across files
- Metadata availability
- Current read/write patterns

Iceberg's design accommodates both scenarios with different migration approaches: in-place migration for Hive tables and metadata-based adoption for Parquet datasets.

## Migration Strategies

### Strategy 1: In-Place Migration (Hive to Iceberg)

In-place migration converts existing Hive tables to Iceberg tables without moving or rewriting data files. This approach offers:

- **Minimal downtime**: Metadata conversion happens quickly
- **No data movement**: Original Parquet/ORC files remain in place
- **Rollback capability**: Can revert to Hive if needed
- **Resource efficiency**: No data copying or rewriting required

**When to use:** Production Hive tables with stable partition schemes, large datasets where data copying is prohibitive, or scenarios requiring minimal disruption.

### Strategy 2: Snapshot and Migrate

Create an Iceberg table and copy data from the source, allowing for optimization during migration:

- **Data optimization**: Rewrite files to optimal sizes
- **Partition evolution**: Restructure partitioning scheme
- **Schema refinement**: Clean up schema inconsistencies
- **Incremental migration**: Migrate in batches over time

**When to use:** When data reorganization is beneficial, source tables have performance issues, or you want to optimize file layouts during migration.

### Strategy 3: Dual-Write Transition

Temporarily write to both old and new formats during transition:

- **Zero downtime**: Seamless cutover for readers
- **Extended validation**: Verify Iceberg behavior with production workloads
- **Gradual migration**: Migrate read traffic incrementally

**When to use:** Mission-critical tables where zero downtime is mandatory, or when extensive validation is required before full cutover.

## Migrating Hive Tables to Iceberg

### Using Spark SQL for In-Place Migration

Spark 3.x provides native support for in-place Hive table migration:

```sql
-- Migrate a Hive table to Iceberg format in-place
CALL system.migrate('db_name.table_name');

-- Verify migration success
DESCRIBE EXTENDED db_name.table_name;
```

This command:
1. Reads existing Hive table metadata
2. Creates Iceberg metadata files
3. Updates the Hive metastore to point to Iceberg
4. Preserves all existing data files

### Programmatic Migration with Spark

For more control over the migration process:

```scala
import org.apache.iceberg.spark.actions.SparkActions

val spark = SparkSession.builder()
  .config("spark.sql.catalog.spark_catalog", "org.apache.iceberg.spark.SparkSessionCatalog")
  .config("spark.sql.catalog.spark_catalog.type", "hive")
  .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
  .enableHiveSupport()
  .getOrCreate()

// Perform in-place migration
val actions = SparkActions.get()
val migrationResult = actions
  .migrateTable("db_name.table_name")
  .execute()

println(s"Migrated ${migrationResult.migratedDataFilesCount} files")
```

### Snapshot Migration Approach

For scenarios requiring data rewrite:

```sql
-- Create new Iceberg table with optimized settings
CREATE TABLE iceberg_catalog.db_name.new_table
USING iceberg
PARTITIONED BY (date, region)
TBLPROPERTIES (
  'write.format.default' = 'parquet',
  'write.parquet.compression-codec' = 'zstd',
  'write.target-file-size-bytes' = '536870912'  -- 512 MB
)
AS SELECT * FROM hive_db.legacy_table;

-- Verify data integrity
SELECT COUNT(*), SUM(bytes_size)
FROM iceberg_catalog.db_name.new_table;
```

## Converting Parquet Datasets to Iceberg

### Adding Metadata to Existing Parquet Files

Iceberg can adopt existing Parquet files without rewriting them:

```scala
import org.apache.iceberg.spark.actions.SparkActions
import org.apache.iceberg.PartitionSpec
import org.apache.iceberg.catalog.TableIdentifier

// Define schema and partition spec
val schema = spark.read.parquet("s3://bucket/data/events/")
  .schema

val spec = PartitionSpec.builderFor(schema)
  .day("event_time")
  .identity("region")
  .build()

// Create Iceberg table metadata
val catalog = spark.sessionState.catalogManager
  .catalog("iceberg_catalog")

catalog.createTable(
  TableIdentifier.of("db_name", "events"),
  schema,
  spec,
  Map("location" -> "s3://bucket/data/events/").asJava
)

// Add existing Parquet files to Iceberg table
SparkActions.get()
  .addFiles(TableIdentifier.of("db_name", "events"))
  .execute()
```

### Incremental Data Migration

For large datasets, migrate in stages:

```sql
-- Create Iceberg table structure
CREATE TABLE iceberg_catalog.analytics.user_events (
  user_id BIGINT,
  event_type STRING,
  event_time TIMESTAMP,
  properties MAP<STRING, STRING>
)
USING iceberg
PARTITIONED BY (days(event_time));

-- Migrate data in daily increments
INSERT INTO iceberg_catalog.analytics.user_events
SELECT * FROM parquet.`s3://bucket/legacy/events/date=2024-01-01/`;

INSERT INTO iceberg_catalog.analytics.user_events
SELECT * FROM parquet.`s3://bucket/legacy/events/date=2024-01-02/`;

-- Continue for remaining dates...
```

## Streaming Integration During Migration

### Kafka to Iceberg with Spark Structured Streaming

During migration, establish streaming pipelines to keep Iceberg tables updated:

```scala
import org.apache.spark.sql.streaming.Trigger

val kafkaStream = spark.readStream
  .format("kafka")
  .option("kafka.bootstrap.servers", "localhost:9092")
  .option("subscribe", "user-events")
  .option("startingOffsets", "earliest")
  .load()

val parsedStream = kafkaStream
  .selectExpr("CAST(value AS STRING) as json")
  .select(from_json($"json", schema).as("data"))
  .select("data.*")

// Write stream to Iceberg with exactly-once semantics
parsedStream.writeStream
  .format("iceberg")
  .outputMode("append")
  .trigger(Trigger.ProcessingTime("30 seconds"))
  .option("checkpointLocation", "s3://bucket/checkpoints/user-events")
  .option("fanout-enabled", "true")
  .toTable("iceberg_catalog.analytics.user_events")
```

### Monitoring Streaming Migrations

Enterprise Kafka management platforms provide capabilities that are invaluable during Iceberg migrations involving streaming data:

- **Data Quality Monitoring**: Track message schemas and validate data integrity during migration
- **Consumer Lag Tracking**: Monitor streaming job performance to ensure migration keeps pace with incoming data
- **Topic Management**: Coordinate multiple Kafka topics feeding into Iceberg tables during phased migrations
- **Schema Registry Integration**: Manage schema evolution across both legacy and Iceberg tables

Robust observability features help data engineers identify bottlenecks, validate data consistency, and ensure zero data loss during the transition to Iceberg-based architectures.

### Handling Late-Arriving Data

Iceberg's ACID guarantees make it ideal for handling late data during migration:

```sql
-- Merge late-arriving historical data
MERGE INTO iceberg_catalog.analytics.user_events t
USING (
  SELECT * FROM parquet.`s3://bucket/late-data/2024-01/`
) s
ON t.user_id = s.user_id AND t.event_time = s.event_time
WHEN NOT MATCHED THEN INSERT *;
```

## Validation and Testing

### Data Integrity Validation

Post-migration, verify data completeness and correctness:

```sql
-- Row count comparison
SELECT
  (SELECT COUNT(*) FROM hive_db.legacy_table) as legacy_count,
  (SELECT COUNT(*) FROM iceberg_catalog.db.new_table) as iceberg_count;

-- Sample data comparison
SELECT * FROM hive_db.legacy_table LIMIT 100
EXCEPT
SELECT * FROM iceberg_catalog.db.new_table LIMIT 100;

-- Aggregate consistency check
SELECT
  date,
  COUNT(*) as record_count,
  SUM(amount) as total_amount
FROM hive_db.legacy_table
GROUP BY date
EXCEPT
SELECT
  date,
  COUNT(*) as record_count,
  SUM(amount) as total_amount
FROM iceberg_catalog.db.new_table
GROUP BY date;
```

### Performance Testing

Compare query performance before and after migration:

```scala
// Benchmark query execution
def benchmarkQuery(query: String, iterations: Int = 5): Unit = {
  val times = (1 to iterations).map { _ =>
    val start = System.currentTimeMillis()
    spark.sql(query).count()
    System.currentTimeMillis() - start
  }
  println(s"Average time: ${times.sum / iterations}ms")
}

benchmarkQuery("SELECT COUNT(*) FROM hive_db.legacy_table WHERE date >= '2024-01-01'")
benchmarkQuery("SELECT COUNT(*) FROM iceberg_catalog.db.new_table WHERE date >= '2024-01-01'")
```

## Best Practices and Considerations

### Metadata Management

- **Catalog Selection**: Choose between Hive Metastore, AWS Glue, or dedicated Iceberg catalogs based on infrastructure
- **Metadata Location**: Store metadata in highly available storage (S3, HDFS with replication)
- **Snapshot Retention**: Configure appropriate retention policies to balance time travel with storage costs

```sql
-- Set snapshot retention policy
ALTER TABLE iceberg_catalog.analytics.events
SET TBLPROPERTIES (
  'write.metadata.delete-after-commit.enabled' = 'true',
  'write.metadata.previous-versions-max' = '100'
);
```

### Performance Optimization

- **File Sizing**: Target 512MB-1GB files for optimal query performance
- **Compaction**: Schedule regular compaction for tables with many small files
- **Partition Evolution**: Leverage hidden partitioning to avoid partition explosion

```sql
-- Compact small files
CALL iceberg_catalog.system.rewrite_data_files(
  table => 'analytics.events',
  options => map(
    'target-file-size-bytes', '536870912',
    'min-file-size-bytes', '134217728'
  )
);
```

### Rollback Planning

Maintain rollback capabilities during migration:

```sql
-- Snapshot Iceberg table before major changes
CALL iceberg_catalog.system.create_changelog_view(
  table => 'analytics.events',
  options => map('start-snapshot-id', '12345678')
);

-- Rollback to previous snapshot if needed
CALL iceberg_catalog.system.rollback_to_snapshot(
  'analytics.events',
  12345678
);
```

### Incremental Adoption

Don't migrate everything at once:

1. **Start with non-critical tables**: Gain experience with low-risk tables
2. **Validate thoroughly**: Run parallel workloads to compare results
3. **Monitor performance**: Track query latency, throughput, and resource usage
4. **Gather feedback**: Involve data consumers in validation
5. **Scale gradually**: Expand to critical tables after proven success

## Conclusion

Migrating to Apache Iceberg from Hive or Parquet represents a strategic investment in modern data infrastructure. Whether using in-place migration for minimal disruption, snapshot migration for optimization opportunities, or dual-write for zero-downtime transitions, careful planning and validation ensure successful outcomes.

The migration journey requires coordinated effort across data engineering, data architecture, and analytics teams. By following these strategies and best practices, organizations can unlock Iceberg's powerful capabilities—ACID transactions, time travel, schema evolution, and partition evolution—while minimizing risk and maintaining business continuity.

Start with pilot migrations, validate rigorously, and scale systematically. The result is a robust, flexible data lakehouse foundation that supports evolving analytics and data science requirements for years to come.

## Sources

- [Apache Iceberg Documentation - Migration Guide](https://iceberg.apache.org/docs/latest/spark-procedures/#migrate)
- [Iceberg Table Migration Strategies](https://iceberg.apache.org/docs/latest/migration/)
- [Spark SQL Guide for Iceberg](https://iceberg.apache.org/docs/latest/spark-queries/)
- [Iceberg Best Practices for Production](https://iceberg.apache.org/docs/latest/configuration/)
