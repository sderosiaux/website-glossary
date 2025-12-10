---
title: "Databricks Delta Live Tables: Declarative ETL"
description: "Delta Live Tables simplifies pipelines with declarative ETL, data quality controls, and dependency management. Build production pipelines with less code and complexity."
topics:
  - Databricks
  - Delta Live Tables
  - ETL
  - Data Pipelines
  - Data Quality
---

# Databricks Delta Live Tables: Declarative ETL

Delta Live Tables (DLT) represents a paradigm shift in how data engineers build and maintain ETL pipelines on Databricks. Instead of imperatively defining how data should flow through your pipeline, DLT lets you declare what your data should look like and automatically handles the orchestration, dependency management, and quality enforcement.

## Understanding Delta Live Tables

Delta Live Tables is a declarative framework for building reliable, maintainable, and testable data processing pipelines. Unlike traditional ETL approaches where you explicitly manage task dependencies, error handling, and data quality checks, DLT infers the pipeline structure from your table definitions and automatically optimizes execution.

The framework introduces several key concepts that distinguish it from conventional ETL patterns:

**Live Tables** are materialized views that are automatically refreshed as source data changes. They represent the core building blocks of your pipeline, with DLT managing all the complexity of incremental processing, state management, and optimization.

**Streaming Tables** enable continuous processing of streaming data sources, allowing you to build real-time pipelines that process data as it arrives without writing explicit streaming logic.

**Data Quality Expectations** are declarative constraints that enforce data quality rules at the pipeline level, automatically tracking violations and optionally failing processing when quality thresholds aren't met.

## Building Declarative Pipelines

The declarative nature of DLT fundamentally changes how you approach pipeline development. Instead of writing procedural code that orchestrates data transformations, you define what each dataset should contain and let DLT figure out the execution plan.

Here's the declarative pipeline structure:

```
Medallion Architecture Pipeline:

┌─────────────────────────────────┐
│  Bronze: Raw Ingestion          │
│  raw_customer_events            │
│  - Auto-schema detection        │
│  - Cloud Files (JSON)           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Silver: Cleaned & Validated    │
│  cleaned_customer_events        │
│  - Quality checks (expectations)│
│  - Drop invalid rows            │
│  - Fail on bad timestamps       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Gold: Aggregated Analytics     │
│  customer_daily_metrics         │
│  - Aggregations by customer     │
│  - Business-ready data          │
└─────────────────────────────────┘

DLT automatically:
- Manages dependencies
- Handles incremental processing
- Tracks data quality metrics
- Orchestrates execution order
```

## Data Quality and Expectations

One of DLT's most powerful features is its built-in data quality framework. Expectations let you define quality constraints directly on your tables, and DLT automatically tracks violations, records metrics, and takes action based on your rules.

DLT supports three types of expectations:

**expect** tracks violations in metrics but allows all records to pass through. This is useful for monitoring data quality trends without blocking pipeline execution.

**expect_or_drop** automatically removes rows that violate the constraint, ensuring only clean data reaches downstream tables while preserving pipeline continuity.

**expect_or_fail** halts pipeline execution when violations occur, enforcing strict quality gates for critical data validations.

The framework automatically maintains quality metrics in the event log, giving you complete visibility into data quality trends over time. This eliminates the need for custom quality monitoring infrastructure and provides a standardized approach to data validation across your organization.

## Streaming Integration with Kafka

Delta Live Tables excels at integrating streaming data sources, particularly Apache Kafka. When combined with streaming management tools for Kafka monitoring and governance, you can build robust real-time data pipelines with minimal code.

Here's how to ingest streaming data from Kafka topics:

```
Kafka + DLT Integration:

┌────────────────────┐
│  Kafka Topic       │
│  orders-topic      │
└─────────┬──────────┘
          │
          ▼
┌─────────────────────────────┐
│  DLT: orders_stream         │
│  - Read from Kafka          │
│  - Deserialize JSON         │
│  - Schema validation        │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│  DLT: enriched_orders       │
│  - Join with customer_dim   │
│  - Quality check (amount>0) │
│  - Drop invalid records     │
└─────────────────────────────┘
          │
          ▼
┌─────────────────────────────┐
│  Delta Lake                 │
│  enriched_orders table      │
└─────────────────────────────┘
```

When working with Kafka streams, streaming management platforms provide essential capabilities for topic management, schema validation, and data quality monitoring before data enters your DLT pipeline. This combination creates a comprehensive solution for streaming data platforms where governance tools handle the Kafka infrastructure complexity while DLT manages the transformation and quality enforcement.

## Pipeline Orchestration and Dependencies

DLT automatically constructs a directed acyclic graph (DAG) of your pipeline by analyzing dependencies between tables. When you reference one table from another using `dlt.read()` or `dlt.read_stream()`, DLT understands the relationship and ensures correct execution order.

This automatic dependency resolution eliminates entire classes of orchestration bugs. You never need to manually specify task dependencies, manage execution order, or handle retry logic. DLT handles all of this based on the declarative relationships you define.

The framework also provides sophisticated incremental processing capabilities. For batch tables, DLT automatically tracks which data has been processed and only processes new or changed data on subsequent runs. For streaming tables, it maintains streaming state automatically, ensuring exactly-once processing semantics without explicit checkpoint management.

## Operational Benefits

Beyond the development experience, DLT provides significant operational advantages. The framework automatically handles schema evolution, allowing your pipeline to adapt to upstream changes without breaking. It provides built-in data lineage tracking, showing exactly how data flows through your pipeline and which transformations were applied.

The auto-scaling capabilities ensure your pipeline uses resources efficiently, scaling up during high-volume periods and down during quiet times. All pipeline metrics, data quality statistics, and execution history are automatically captured in the event log, providing comprehensive observability without custom instrumentation.

DLT's integration with Unity Catalog provides enterprise-grade governance, enabling fine-grained access control, data classification, and audit logging across your entire data platform.

## Conclusion

Delta Live Tables represents a significant evolution in data pipeline development, bringing declarative programming paradigms to the world of data engineering. By focusing on what your data should look like rather than how to produce it, DLT enables faster development, higher reliability, and better maintainability of complex data pipelines.

The framework's built-in data quality controls, automatic dependency management, and seamless streaming integration make it an ideal choice for building production-grade data platforms. Whether you're processing batch data, streaming events from Kafka, or building complex medallion architectures, DLT provides the abstractions and automation needed to deliver reliable data at scale.

## Sources

- [Delta Live Tables Documentation - Databricks](https://docs.databricks.com/delta-live-tables/index.html)
- [Delta Live Tables Expectations - Data Quality](https://docs.databricks.com/delta-live-tables/expectations.html)
- [Streaming with Delta Live Tables - Databricks](https://docs.databricks.com/delta-live-tables/streaming.html)
- [Apache Kafka Integration with Databricks](https://docs.databricks.com/structured-streaming/kafka.html)
- [Delta Live Tables Best Practices - Databricks](https://docs.databricks.com/delta-live-tables/best-practices.html)
