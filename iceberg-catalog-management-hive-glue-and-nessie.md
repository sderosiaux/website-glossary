---
title: "Iceberg Catalog Management: Hive, Glue, and Nessie"
description: "A comprehensive guide to managing Apache Iceberg table catalogs, comparing Hive Metastore, AWS Glue, and Project Nessie implementations. Learn catalog integration patterns, metadata storage strategies, and migration approaches for modern data platforms."
topics:
  - Apache Iceberg
  - Catalog Management
  - AWS Glue
  - Project Nessie
  - Data Governance
---

# Iceberg Catalog Management: Hive, Glue, and Nessie

Apache Iceberg has emerged as a leading table format for data lakes, offering ACID transactions, schema evolution, and time travel capabilities. At the heart of Iceberg's architecture lies the catalog—a critical component responsible for tracking table metadata, managing table locations, and coordinating concurrent operations. Understanding the differences between catalog implementations is essential for data architects and platform engineers building scalable data infrastructures.

This article explores three prominent catalog solutions: Hive Metastore, AWS Glue, and Project Nessie, examining their architecture, configuration, and operational characteristics.

## Understanding Iceberg Catalogs

An Iceberg catalog serves as the authoritative source for table metadata, maintaining pointers to the current metadata file for each table. When a query engine or processing framework needs to read or write an Iceberg table, it first consults the catalog to locate the table's metadata.

The catalog's responsibilities include:

- **Table Discovery**: Maintaining a registry of available tables and their locations
- **Metadata Pointer Management**: Tracking the current metadata file for each table
- **Atomic Updates**: Ensuring that metadata updates occur atomically to prevent corruption
- **Namespace Management**: Organizing tables into hierarchical namespaces or databases

The choice of catalog implementation impacts operational complexity, scalability, multi-engine compatibility, and advanced features like versioning and branching.

## Hive Metastore Catalog

The Hive Metastore has long been the de facto metadata repository in the Hadoop ecosystem. Iceberg's Hive catalog implementation leverages this existing infrastructure, making it a natural choice for organizations with established Hive deployments.

### Architecture and Characteristics

The Hive Metastore uses a relational database (typically MySQL, PostgreSQL, or MariaDB) to store metadata. For Iceberg tables, the metastore stores the table location and a pointer to the current metadata file. The actual table metadata, manifests, and data files reside in object storage or HDFS.

**Advantages:**
- Broad compatibility with existing tools and engines
- Mature and well-understood operational model
- Native support in most query engines (Spark, Trino, Flink)

**Limitations:**
- No built-in versioning or branching capabilities
- Potential bottleneck for high-concurrency environments
- Requires separate infrastructure management

### Configuration Example

```python
# Spark Configuration for Hive Catalog
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("IcebergHiveCatalog") \
    .config("spark.sql.catalog.hive_catalog", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.hive_catalog.type", "hive") \
    .config("spark.sql.catalog.hive_catalog.uri", "thrift://metastore-host:9083") \
    .config("spark.sql.catalog.hive_catalog.warehouse", "s3://bucket/warehouse") \
    .enableHiveSupport() \
    .getOrCreate()

# Create a table using Hive catalog
spark.sql("""
    CREATE TABLE hive_catalog.db.events (
        event_id STRING,
        timestamp TIMESTAMP,
        user_id STRING,
        event_type STRING
    )
    USING iceberg
    PARTITIONED BY (days(timestamp))
""")
```

## AWS Glue Catalog

AWS Glue provides a fully managed metadata catalog service that integrates seamlessly with the AWS ecosystem. The Glue catalog implementation for Iceberg offers serverless operation without the overhead of managing metastore infrastructure.

### Architecture and Characteristics

The Glue catalog stores Iceberg table metadata in a managed service, eliminating the need for database administration. It integrates naturally with other AWS services like Athena, EMR, and Redshift Spectrum.

**Advantages:**
- Serverless and fully managed—no infrastructure to maintain
- Fine-grained IAM-based access control
- Native integration with AWS analytics services
- Built-in data cataloging and discovery features

**Limitations:**
- AWS ecosystem lock-in
- API rate limits may impact high-frequency operations
- Limited versioning capabilities compared to specialized solutions

### Configuration Example

```python
# Spark Configuration for Glue Catalog
spark = SparkSession.builder \
    .appName("IcebergGlueCatalog") \
    .config("spark.sql.catalog.glue_catalog", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.glue_catalog.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog") \
    .config("spark.sql.catalog.glue_catalog.warehouse", "s3://bucket/warehouse") \
    .config("spark.sql.catalog.glue_catalog.io-impl", "org.apache.iceberg.aws.s3.S3FileIO") \
    .getOrCreate()

# Create table using Glue catalog
spark.sql("""
    CREATE TABLE glue_catalog.analytics.user_sessions (
        session_id STRING,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        page_views INT
    )
    USING iceberg
    TBLPROPERTIES (
        'write.format.default' = 'parquet',
        'write.parquet.compression-codec' = 'snappy'
    )
""")
```

## Project Nessie Catalog

Project Nessie represents a paradigm shift in catalog management by introducing Git-like versioning semantics to data lakes. It provides branches, tags, and commit history for Iceberg tables, enabling advanced workflows like experimentation, rollback, and cross-table consistency.

### Architecture and Characteristics

Nessie stores catalog state in a versioned data structure, supporting multiple branches of table metadata. This allows data engineers to create isolated environments for development, testing, and production within the same catalog.

**Advantages:**
- Git-like branching and tagging for tables
- Cross-table transactions and consistency
- Audit trail with full commit history
- Support for experimentation and safe rollback
- Multi-table atomic commits

**Limitations:**
- Relatively newer technology with smaller adoption
- Additional operational complexity
- Requires understanding of version control concepts

### Configuration Example

```python
# Spark Configuration for Nessie Catalog
spark = SparkSession.builder \
    .appName("IcebergNessieCatalog") \
    .config("spark.sql.catalog.nessie", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.nessie.catalog-impl", "org.apache.iceberg.nessie.NessieCatalog") \
    .config("spark.sql.catalog.nessie.uri", "http://nessie-server:19120/api/v1") \
    .config("spark.sql.catalog.nessie.ref", "main") \
    .config("spark.sql.catalog.nessie.warehouse", "s3://bucket/warehouse") \
    .getOrCreate()

# Create a branch for development
spark.sql("CREATE BRANCH dev IN nessie FROM main")

# Switch to dev branch and create table
spark.sql("USE REFERENCE dev IN nessie")
spark.sql("""
    CREATE TABLE nessie.analytics.experiments (
        experiment_id STRING,
        variant STRING,
        metrics MAP<STRING, DOUBLE>
    )
    USING iceberg
""")

# Merge changes back to main after validation
spark.sql("MERGE BRANCH dev INTO main IN nessie")
```

## Streaming Ecosystem Integration

Iceberg catalogs play a crucial role in streaming architectures, where real-time data pipelines continuously ingest and process events. The catalog choice impacts streaming framework integration, particularly with Apache Flink, Spark Structured Streaming, and Kafka-based pipelines.

### Streaming Considerations

**Catalog Commit Frequency**: Streaming jobs commit snapshots at regular intervals (e.g., every checkpoint in Flink). The catalog must handle these frequent metadata updates efficiently.

**Multi-Writer Scenarios**: Stream processing often involves multiple parallel writers. The catalog must provide optimistic concurrency control to prevent conflicts.

**Schema Evolution**: Streaming schemas evolve over time. The catalog should support backward-compatible schema changes without disrupting active streams.

### Apache Flink Example

```java
// Flink streaming write to Iceberg with Hive catalog
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
StreamTableEnvironment tableEnv = StreamTableEnvironment.create(env);

// Configure catalog
tableEnv.executeSql(
    "CREATE CATALOG hive_catalog WITH (" +
    "  'type' = 'iceberg'," +
    "  'catalog-type' = 'hive'," +
    "  'uri' = 'thrift://metastore:9083'," +
    "  'warehouse' = 's3://bucket/warehouse'" +
    ")"
);

// Streaming INSERT with automatic schema evolution
tableEnv.executeSql(
    "INSERT INTO hive_catalog.db.events " +
    "SELECT event_id, event_time, user_id, event_type " +
    "FROM kafka_source"
);
```

### Governance and Visibility

For organizations managing complex streaming pipelines with Iceberg tables, data governance platforms provide essential visibility into catalog operations. These platforms can monitor schema evolution events, track data lineage from streaming sources through Iceberg tables, and enforce governance policies across the data platform. This becomes particularly valuable when managing multiple catalogs or migrating between catalog implementations, ensuring that metadata changes and access patterns remain auditable and compliant.

## Catalog Migration Strategies

Organizations may need to migrate between catalog implementations as requirements evolve. Common migration scenarios include moving from Hive Metastore to AWS Glue for operational simplification, or adopting Nessie for advanced versioning capabilities.

### Migration Approaches

**1. Dual-Catalog Operation**

Temporarily maintain both catalogs, registering tables in both systems during the transition period. This allows gradual migration of workloads.

```python
# Register table in both catalogs
spark.sql("CREATE TABLE hive_catalog.db.events USING iceberg ...")
spark.sql("CREATE TABLE glue_catalog.db.events USING iceberg LOCATION 's3://...'")
```

**2. Metadata Export and Import**

Export table metadata from the source catalog and re-register in the target catalog. The underlying data files remain unchanged.

```python
# Export metadata location from Hive
hive_location = spark.sql("DESCRIBE EXTENDED hive_catalog.db.events") \
    .filter("col_name = 'Location'").collect()[0].data_type

# Register in Glue catalog
spark.sql(f"CREATE TABLE glue_catalog.db.events USING iceberg LOCATION '{hive_location}'")
```

**3. Catalog Proxy Pattern**

Use a catalog proxy or abstraction layer that can route requests to different underlying catalogs based on configuration.

### Migration Considerations

- **Downtime Requirements**: Determine if zero-downtime migration is necessary
- **Consistency Guarantees**: Ensure atomic cutover to prevent split-brain scenarios
- **Access Control**: Map permissions from source to target catalog
- **Validation**: Verify table accessibility and metadata integrity post-migration

## Catalog Selection Criteria

Choosing the right catalog implementation depends on several factors:

**Hive Metastore** is appropriate when:
- You have existing Hive infrastructure and expertise
- Multi-cloud or on-premises deployment is required
- Tool compatibility is the primary concern
- Advanced versioning is not a requirement

**AWS Glue** is suitable when:
- Your infrastructure is primarily AWS-based
- You prefer managed services over self-hosted solutions
- Integration with AWS analytics services is valuable
- Operational simplicity is a priority

**Project Nessie** excels when:
- You need Git-like versioning and branching
- Cross-table consistency is critical
- You want to support development/staging/production isolation
- Audit trails and experimentation workflows are important

## Summary

Iceberg catalogs are foundational to successful data lake implementations, and the choice between Hive Metastore, AWS Glue, and Project Nessie significantly impacts your platform's capabilities and operational characteristics.

Hive Metastore offers broad compatibility and maturity but requires infrastructure management. AWS Glue provides serverless convenience within the AWS ecosystem, ideal for cloud-native architectures. Project Nessie introduces powerful versioning semantics, enabling advanced workflows at the cost of increased conceptual complexity.

For streaming workloads, catalog performance under frequent commits and multi-writer scenarios becomes critical. Integration with governance platforms helps maintain visibility and control as catalog complexity grows.

When evaluating catalog options, consider your infrastructure constraints, operational capabilities, versioning requirements, and long-term platform evolution. Many organizations benefit from a multi-catalog strategy, using different implementations for different use cases or environments.

## Sources and References

- [Apache Iceberg Documentation - Catalogs](https://iceberg.apache.org/docs/latest/configuration/)
- [AWS Glue Catalog Integration with Iceberg](https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html)
- [Project Nessie Documentation](https://projectnessie.org/docs/)
- [Iceberg Catalog Specification](https://iceberg.apache.org/spec/#catalog)
- [Apache Flink Iceberg Integration](https://nightlies.apache.org/flink/flink-docs-stable/docs/connectors/table/iceberg/)
- [Iceberg Hive Metastore Catalog](https://iceberg.apache.org/docs/latest/hive/)
- [Tabular: Iceberg Catalog Best Practices](https://tabular.io/blog/)
