---
title: "Kafka Connect Single Message Transforms"
description: "Single Message Transforms (SMTs) enable lightweight data transformations within Kafka Connect pipelines. Learn how SMTs work, common use cases, and when to use them versus full stream processing frameworks."
topics:
  - kafka-connect
  - data-transformation
  - stream-processing
  - kafka
---

# Kafka Connect Single Message Transforms

When building data pipelines with Kafka Connect, you often need to modify data as it flows between systems. Single Message Transforms (SMTs) provide a lightweight mechanism to transform records within the connector itself, without requiring separate stream processing applications.

## What Are Single Message Transforms?

Single Message Transforms are pluggable components in Kafka Connect that modify individual records as they pass through a connector. SMTs operate on one message at a time, applying transformations like field manipulation, filtering, or routing during the data movement process.

SMTs are configured directly in the connector configuration and execute within the Connect worker's JVM. This makes them simpler to deploy than standalone stream processing applications, but also more limited in capability. They are ideal for straightforward transformations that don't require aggregations, joins, or complex stateful processing.

The Kafka Connect framework includes several built-in SMTs, and you can also develop custom transformations by implementing the `org.apache.kafka.connect.transforms.Transformation` interface.

## How SMTs Work

SMTs are applied in a chain during the connector's data flow. For source connectors, transformations occur after data is read from the source system but before it's written to Kafka. For sink connectors, SMTs execute after reading from Kafka but before writing to the destination system.

Each SMT receives a `SinkRecord` or `SourceRecord` object, applies its transformation logic, and returns a modified record. The transformed record then passes to the next SMT in the chain, creating a pipeline of transformations.

Here's how you configure SMTs in a connector:

```properties
transforms=maskPII,addTimestamp
transforms.maskPII.type=org.apache.kafka.connect.transforms.MaskField$Value
transforms.maskPII.fields=ssn,creditCard
transforms.addTimestamp.type=org.apache.kafka.connect.transforms.InsertField$Value
transforms.addTimestamp.timestamp.field=processing_time
```

This configuration creates a chain of two transformations: first masking sensitive fields, then adding a timestamp field.

## Common Built-in SMT Types

Kafka Connect provides several useful built-in transformations:

**Field Manipulation**: The `InsertField` SMT adds metadata fields like timestamps or static values. The `ReplaceField` SMT renames or excludes specific fields. The `MaskField` SMT masks sensitive data with null values, useful for PII protection.

**Casting and Type Conversion**: The `Cast` SMT converts field types, such as changing strings to integers or timestamps to different formats. This helps align data types between source and destination systems.

**Filtering and Routing**: The `Filter` SMT drops records based on predicates, while `RegexRouter` and `TimestampRouter` modify topic names dynamically based on record content or timestamps. These are particularly useful for partitioning data across multiple topics.

**Schema Modifications**: The `Flatten` SMT converts nested structures into flat records, making complex JSON or Avro data compatible with relational databases. The `HoistField` SMT wraps the entire record value in a struct field.

**Content Extraction**: The `ExtractField` SMT extracts a single field from a complex record, useful when you only need one piece of data from a larger structure.

## Real-World Use Cases

Consider a typical scenario: streaming customer data from a PostgreSQL database to Amazon S3 for analytics. The source data contains sensitive information that must be masked before storage.

```properties
name=postgres-to-s3-connector
connector.class=io.confluent.connect.s3.S3SinkConnector
topics=customer_data
transforms=maskSensitive,addPartition,flatten

transforms.maskSensitive.type=org.apache.kafka.connect.transforms.MaskField$Value
transforms.maskSensitive.fields=ssn,credit_card,password

transforms.addPartition.type=org.apache.kafka.connect.transforms.InsertField$Value
transforms.addPartition.static.field=ingest_date
transforms.addPartition.static.value=${sys:currentDate}

transforms.flatten.type=org.apache.kafka.connect.transforms.Flatten$Value
transforms.flatten.delimiter=_
```

This pipeline masks PII fields, adds a partition date for efficient S3 organization, and flattens nested structures for easier querying.

Another common pattern involves dynamic topic routing. A source connector might read from multiple database tables and route each to a different Kafka topic:

```properties
transforms=route
transforms.route.type=org.apache.kafka.connect.transforms.RegexRouter
transforms.route.regex=(.*)
transforms.route.replacement=db_$1_events
```

## SMTs vs Full Stream Processing

While SMTs provide convenient transformation capabilities, they have important limitations compared to dedicated stream processing frameworks like Kafka Streams or Apache Flink.

SMTs operate on individual messages without state or context from other messages. You cannot perform aggregations, windowing, joins between streams, or complex event processing. If your transformation logic requires correlating multiple events or maintaining state over time, you need a stream processing framework.

SMTs also lack sophisticated error handling. If a transformation fails, the entire connector typically stops. Stream processing frameworks offer fine-grained error handling, dead letter queues, and retry mechanisms.

However, SMTs offer significant advantages for simple transformations. They eliminate the need to deploy and manage separate stream processing applications, reducing operational complexity. They're easier to configure and test, and they keep your data pipeline architecture simpler when complex processing isn't required.

Tools like Conduktor Console help manage this complexity by providing visual configuration and validation of SMT chains, making it easier to build and debug transformation pipelines without manual JSON editing.

## Best Practices and Limitations

When working with SMTs, keep transformations simple and focused. Each SMT should perform one clear function. Complex multi-step transformations become difficult to debug and maintain.

Be aware of performance implications. SMTs execute synchronously in the connector's data path, so slow transformations directly impact throughput. Avoid expensive operations like external API calls or heavy computation within SMTs.

Consider schema compatibility carefully. If you're using a schema registry, ensure your transformations maintain schema compatibility or explicitly version your schemas. The `Cast` and `Flatten` SMTs can inadvertently break schema evolution if not configured properly.

Test your SMT configurations thoroughly before production deployment. Since SMTs modify data in flight, errors can corrupt your data pipeline. Use tools that validate configurations and provide test environments for SMT chains.

Remember that SMTs cannot access external data sources or services. They work only with the data in the current record and connector configuration. If you need to enrich data from external systems, consider using a stream processing framework instead.

Custom SMTs are straightforward to develop, but ensure they're stateless, thread-safe, and handle errors gracefully. Poor custom SMT implementations can crash connectors or cause data loss.

## Summary

Single Message Transforms provide a lightweight, convenient way to modify data within Kafka Connect pipelines. They're ideal for simple, per-record transformations like field masking, type conversion, schema flattening, and dynamic routing.

SMTs shine when you need straightforward transformations without the operational overhead of separate stream processing applications. They're configured directly in connector properties, execute efficiently within the Connect worker, and leverage built-in transformations for common patterns.

However, SMTs are not suitable for stateful processing, aggregations, or complex event patterns. Understanding when to use SMTs versus full stream processing frameworks is crucial for building efficient, maintainable data pipelines.

For simple transformations at the connector level, SMTs offer the right balance of capability and simplicity. For complex processing requirements, consider Apache Kafka Streams, Apache Flink, or similar frameworks that provide comprehensive stream processing capabilities.

## Sources and References

1. Apache Kafka Documentation - "Kafka Connect Transformations": https://kafka.apache.org/documentation/#connect_transforms
2. Confluent Documentation - "Single Message Transforms": https://docs.confluent.io/platform/current/connect/transforms/overview.html
3. Kafka Connect GitHub Repository - SMT Source Code: https://github.com/apache/kafka/tree/trunk/connect/transforms
4. Confluent Blog - "12 Single Message Transformations to Make the Most of Kafka Connect": https://www.confluent.io/blog/kafka-connect-single-message-transformation-tutorial-with-examples/
5. Apache Kafka Javadoc - Transformation Interface: https://kafka.apache.org/documentation/#connect_transforms
