---
title: "dbt Incremental Models: Efficient Transformations"
description: "Master dbt incremental models to optimize data transformations with merge strategies, streaming integration, and performance best practices for analytics engineering"
topics:
  - dbt
  - Incremental Models
  - Merge Strategy
  - Performance Optimization
  - Analytics Engineering
---

# dbt Incremental Models: Efficient Transformations

In modern data warehouses, transforming billions of rows daily becomes expensive and time-consuming when using traditional full-refresh approaches. dbt incremental models solve this challenge by processing only new or changed records, dramatically reducing compute costs and transformation times.

## Understanding Incremental Models

Incremental models operate on a simple but powerful principle: instead of rebuilding entire tables from scratch, they identify and process only the delta—the new or modified records since the last run. This approach transforms what might be hour-long jobs into minute-long operations.

Consider a typical scenario: you have an events table with billions of historical records. A full refresh would reprocess every single event, even though only today's data has changed. An incremental model processes just today's events, appending or merging them into the existing table.

## Basic Incremental Configuration

Let's start with a fundamental incremental model:

```sql
{{
  config(
    materialized='incremental',
    unique_key='event_id'
  )
}}

select
  event_id,
  user_id,
  event_type,
  event_timestamp,
  properties
from {{ source('raw', 'events') }}

{% if is_incremental() %}
  where event_timestamp > (select max(event_timestamp) from {{ this }})
{% endif %}
```

The `is_incremental()` macro is crucial—it returns `false` on the first run, building the full table. On subsequent runs, it returns `true`, triggering the filter that selects only new records. The `{{ this }}` reference points to the current model's table.

## Merge Strategies Explained

dbt supports multiple strategies for handling incremental updates, each suited to different use cases.

### Append Strategy

The simplest approach—new rows are added without checking for duplicates:

```sql
{{
  config(
    materialized='incremental',
    incremental_strategy='append'
  )
}}

select
  event_id,
  occurred_at,
  event_data
from {{ source('kafka', 'raw_events') }}
{% if is_incremental() %}
  where occurred_at > (select max(occurred_at) from {{ this }})
{% endif %}
```

Use append when you have truly immutable event streams where duplicates are impossible or handled upstream.

### Merge Strategy

The merge strategy (default for Snowflake, BigQuery) uses `unique_key` to update existing records and insert new ones:

```sql
{{
  config(
    materialized='incremental',
    unique_key='user_id',
    incremental_strategy='merge'
  )
}}

select
  user_id,
  email,
  last_login_at,
  total_purchases,
  updated_at
from {{ source('app_db', 'users') }}
{% if is_incremental() %}
  where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```

This executes as a `MERGE` statement (or equivalent), perfect for slowly changing dimensions where records update over time.

### Delete+Insert Strategy

For data warehouses lacking efficient merge operations (like Redshift), delete+insert removes matching records before inserting new ones:

```sql
{{
  config(
    materialized='incremental',
    unique_key='order_id',
    incremental_strategy='delete+insert'
  )
}}

select
  order_id,
  customer_id,
  order_status,
  order_total,
  updated_at
from {{ source('postgres', 'orders') }}
{% if is_incremental() %}
  where updated_at >= current_date - interval '7 days'
{% endif %}
```

This strategy processes batches (like the last 7 days) and completely refreshes those records, handling late-arriving updates effectively.

## Streaming Integration with Kafka

Modern analytics pipelines increasingly integrate streaming data. When connecting dbt to Kafka topics, incremental models become essential for managing continuous data flows.

Governance platforms provide enterprise-grade Kafka management, allowing you to monitor, transform, and route streaming data. When paired with dbt incremental models, you can efficiently transform streaming data into analytics-ready tables:

```sql
{{
  config(
    materialized='incremental',
    unique_key=['event_id', 'partition'],
    incremental_strategy='append',
    on_schema_change='sync_all_columns'
  )
}}

with kafka_stream as (
  select
    value:event_id::varchar as event_id,
    value:user_id::varchar as user_id,
    value:action::varchar as action,
    to_timestamp(value:timestamp::bigint) as event_timestamp,
    _partition as partition,
    _offset as kafka_offset
  from {{ source('kafka_connector', 'user_activity_topic') }}
  {% if is_incremental() %}
    where _offset > (select max(kafka_offset) from {{ this }})
  {% endif %}
)

select
  event_id,
  user_id,
  action,
  event_timestamp,
  partition,
  kafka_offset,
  current_timestamp() as processed_at
from kafka_stream
```

Using Kafka offsets as incremental filters ensures exactly-once processing semantics. Schema registry integration ensures your dbt models automatically adapt to schema evolution via `on_schema_change='sync_all_columns'`.

## Performance Optimization Patterns

### Partitioned Tables

Combine incremental models with table partitioning for maximum efficiency:

```sql
{{
  config(
    materialized='incremental',
    unique_key='transaction_id',
    partition_by={
      "field": "transaction_date",
      "data_type": "date",
      "granularity": "day"
    }
  )
}}
```

This limits scans to relevant partitions, dramatically reducing query costs.

### Clustered Keys

Add clustering for frequently filtered columns:

```sql
{{
  config(
    materialized='incremental',
    unique_key='session_id',
    cluster_by=['user_id', 'session_start']
  )
}}
```

### Lookback Windows

For late-arriving data, implement lookback windows:

```sql
{% if is_incremental() %}
  where event_date >= (select max(event_date) - interval '3 days' from {{ this }})
{% endif %}
```

This reprocesses the last 3 days, catching late arrivals while avoiding full refreshes.

## Testing and Monitoring

Always implement tests for incremental models:

```yaml
models:
  - name: incremental_events
    tests:
      - dbt_utils.recency:
          datepart: hour
          field: event_timestamp
          interval: 2
    columns:
      - name: event_id
        tests:
          - unique
          - not_null
```

Monitor your incremental logic by tracking processed record counts and execution times in dbt Cloud or via custom macros that log metrics to your data warehouse.

## Common Pitfalls

**Forgetting the initial load**: Always test your model with a full refresh to ensure it works without the incremental filter.

**Ignoring idempotency**: Incremental models should produce identical results whether run once or multiple times—critical for backfills and reruns.

**Over-relying on timestamps**: Clock skew and late-arriving data can cause missed records. Consider using sequence numbers or offsets when available.

## Conclusion

Incremental models represent a fundamental shift from batch-oriented to continuous transformation patterns. By processing only what's changed, they enable real-time analytics at scale while controlling costs. Whether you're integrating Kafka streams or transforming traditional database changes, mastering incremental strategies is essential for modern analytics engineering.

Start with simple append strategies for immutable events, graduate to merge strategies for changing dimensions, and leverage streaming offsets for real-time pipelines. With proper testing and monitoring, incremental models will transform your data platform's efficiency and responsiveness.

## Sources and References

- [dbt Documentation: Incremental Models](https://docs.getdbt.com/docs/build/incremental-models)
- [dbt Best Practices: Incremental Model Strategies](https://docs.getdbt.com/best-practices/materializations/2-incremental-models)
- [Apache Kafka Consumer Documentation](https://kafka.apache.org/documentation/#consumerapi)
- [Snowflake MERGE Statement Guide](https://docs.snowflake.com/en/sql-reference/sql/merge)
- [Analytics Engineering: A Guide to dbt](https://www.getdbt.com/analytics-engineering/)
