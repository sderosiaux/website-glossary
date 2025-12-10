---
title: "Log-Based vs Query-Based CDC: Comparison"
description: "Compare log-based and query-based CDC approaches. Learn architectures, trade-offs, use cases, and integration with modern streaming ecosystems for data engineering."
topics:
  - Change Data Capture
  - Log-Based CDC
  - Query-Based CDC
  - Data Replication
  - Data Integration
---

# Log-Based vs Query-Based CDC: Comparison

Change Data Capture (CDC) is a fundamental pattern in modern data engineering that enables real-time data synchronization between systems. As organizations move toward event-driven architectures and real-time analytics, choosing the right CDC approach becomes critical. This article compares the two primary CDC strategies—log-based and query-based—to help data architects and engineers make informed decisions.

## Understanding CDC Approaches

CDC captures changes made to data sources and propagates them to downstream systems. While the goal remains consistent across implementations, the mechanism for detecting and capturing changes varies significantly between approaches.

**Query-Based CDC** periodically polls the source database using SQL queries to identify changed records. It typically relies on timestamp columns, version numbers, or hash comparisons to detect modifications.

**Log-Based CDC** reads changes directly from the database's transaction log (also called write-ahead log or redo log), capturing every committed transaction without querying the source tables.

```
Query-Based CDC:
┌──────────────────┐
│  Source Database │
│  ┌────────────┐  │
│  │   orders   │  │◄─── Periodic SELECT queries
│  │ updated_at │  │     (every N minutes)
│  └────────────┘  │
└─────────┬────────┘
          │ Results
          ▼
    ┌──────────┐
    │ CDC Tool │
    └──────────┘

Log-Based CDC:
┌──────────────────┐
│  Source Database │
│  ┌────────────┐  │
│  │   orders   │  │
│  └────────────┘  │
│         │        │
│         ▼        │
│  ┌────────────┐  │
│  │ WAL/Binlog │  │◄─── Continuous log reading
│  └────────────┘  │     (real-time)
└─────────┬────────┘
          │ Change events
          ▼
    ┌──────────┐
    │ Debezium │
    └────┬─────┘
         │
         ▼
    ┌────────┐
    │ Kafka  │
    └────────┘
```

## Query-Based CDC: Architecture and Characteristics

Query-based CDC operates by executing periodic SELECT queries against source tables to identify new, modified, or deleted records.

### How It Works

The process follows this pattern:

1. Store the last synchronization checkpoint (timestamp, ID, or hash)
2. Execute a query filtering records beyond the checkpoint
3. Process captured changes
4. Update the checkpoint for the next iteration

### Advantages

- **Simple Implementation**: Requires only database read access and basic SQL knowledge
- **Database Agnostic**: Works with any database supporting SQL queries
- **No Special Permissions**: Standard read permissions suffice
- **Easy Debugging**: Query logic is transparent and traceable

### Limitations

- **Performance Impact**: Periodic queries add load to production databases
- **Missing Deletes**: Hard deletes cannot be captured without additional tracking tables
- **Latency**: Polling interval creates inherent delay (typically minutes)
- **Schema Dependencies**: Requires specific columns (timestamps, version fields)
- **Incomplete Capture**: Only sees final state, misses intermediate changes within polling intervals

## Log-Based CDC: Architecture and Characteristics

Log-based CDC reads changes directly from the database's transaction log, capturing every modification as it occurs.

### How It Works

Database transaction logs record every committed change for recovery and replication purposes. Log-based CDC tools parse these binary logs to extract change events.

### Advantages

- **Low Latency**: Near real-time capture (sub-second to seconds)
- **Minimal Source Impact**: No queries against production tables
- **Complete Change Capture**: Captures all operations including deletes
- **Historical Accuracy**: Preserves order and timing of changes
- **Schema Flexibility**: No special columns required in source tables

### Limitations

- **Complex Setup**: Requires specialized tools and database-specific configuration
- **Permission Requirements**: Needs elevated database privileges
- **Database Specific**: Implementation varies by database system
- **Operational Complexity**: Log retention, parsing errors, and schema evolution require careful management

## Head-to-Head Comparison

| Dimension | Query-Based CDC | Log-Based CDC |
|-----------|----------------|---------------|
| **Latency** | Minutes (polling interval) | Sub-second to seconds |
| **Source Impact** | High (periodic queries) | Minimal (log reading) |
| **Delete Capture** | Difficult/impossible | Native support |
| **Setup Complexity** | Low | High |
| **Database Support** | Universal | Database-specific |
| **Permissions** | Read access | Replication/log access |
| **Resource Usage** | CPU/IO on source DB | Minimal on source |
| **Operational Maturity** | Well-understood | Requires specialized expertise |
| **Cost** | Lower (simpler tooling) | Higher (specialized tools) |
| **Schema Changes** | Manual query updates | Automatic detection |

## Streaming Ecosystem Integration

Modern data architectures increasingly rely on streaming platforms for event distribution, making CDC integration with streaming ecosystems essential.

### Kafka and Debezium

**Debezium** is the leading open-source platform for log-based CDC, providing connectors for MySQL, PostgreSQL, MongoDB, SQL Server, and Oracle. It streams database changes directly to Apache Kafka topics, enabling real-time data pipelines.

### Governance and Observability

As CDC implementations scale, governance and visibility become critical. Streaming governance platforms provide centralized management for Kafka-based CDC pipelines, offering:

- **Schema Registry Management**: Track schema evolution across CDC topics
- **Data Flow Visualization**: Map data lineage from source databases through Kafka to consumers
- **Quality Monitoring**: Detect data quality issues, lag, and throughput anomalies
- **Access Control**: Govern who can consume CDC streams and enforce data policies
- **Alerting**: Proactive notifications for connector failures or data drift

For teams running Debezium at scale, unified governance interfaces simplify monitoring connector health, schema changes, and consumer lag across multiple CDC pipelines.

## Choosing the Right Approach

Select your CDC strategy based on these criteria:

### Choose Query-Based CDC When:

- Latency requirements are relaxed (5-15+ minute delays acceptable)
- Source system load can accommodate periodic queries
- Budget constrains specialized tooling investment
- Team lacks database administration expertise
- Deletes are rare or handled through soft-delete patterns
- Database variety makes log-based tooling impractical

### Choose Log-Based CDC When:

- Near real-time data (seconds) is required
- Source database performance must be protected
- Complete audit trail including deletes is necessary
- Integrating with streaming platforms (Kafka, Pulsar)
- Organization has database administration capabilities
- Data consistency and ordering matter
- Supporting event-driven architectures

### Hybrid Approaches

Some organizations combine both approaches:

- **Log-based for critical tables**: High-value, frequently changing data
- **Query-based for dimension tables**: Slowly changing, less critical data
- **Fallback mechanisms**: Query-based as backup when log access is unavailable

## Summary

Log-based and query-based CDC serve the same fundamental purpose but differ significantly in architecture, performance, and operational characteristics.

**Query-based CDC** offers simplicity and universal compatibility, making it suitable for batch-oriented use cases with relaxed latency requirements. Its polling mechanism introduces source database load and inherent delays but requires minimal setup and expertise.

**Log-based CDC** delivers near real-time capture with minimal source impact by reading transaction logs directly. While operationally complex and database-specific, it excels in streaming architectures and event-driven systems where latency and completeness matter.

For modern data engineering scenarios involving real-time analytics, microservices integration, or event streaming platforms like Kafka, log-based CDC with tools like Debezium generally provides superior capabilities. Organizations implementing these solutions should leverage governance platforms to maintain visibility and control as CDC pipelines scale.

The choice ultimately depends on your specific requirements: if you need simplicity and can accept delays, query-based CDC suffices. If real-time data, minimal source impact, and complete change capture are priorities, invest in log-based CDC infrastructure.

## Sources and References

- **Debezium Documentation**: [https://debezium.io/documentation/](https://debezium.io/documentation/)
- **Kafka Connect Documentation**: [https://kafka.apache.org/documentation/#connect](https://kafka.apache.org/documentation/#connect)
- **PostgreSQL Logical Decoding**: [https://www.postgresql.org/docs/current/logicaldecoding.html](https://www.postgresql.org/docs/current/logicaldecoding.html)
- **MySQL Binary Log**: [https://dev.mysql.com/doc/refman/8.0/en/binary-log.html](https://dev.mysql.com/doc/refman/8.0/en/binary-log.html)
- **Martin Kleppmann - "Designing Data-Intensive Applications"**: Chapter 11 on Stream Processing
- **Confluent Kafka Connect JDBC Connector**: [https://docs.confluent.io/kafka-connect-jdbc/current/](https://docs.confluent.io/kafka-connect-jdbc/current/)
