---
title: "Exactly-Once Semantics"
description: Learn how exactly-once semantics prevents data loss and duplication in streaming pipelines through idempotent producers, transactions, and checkpoints.
topics:
  - Exactly-Once Semantics
  - Data Integrity
  - Apache Kafka
  - Stream Processing
  - Transactions
  - Kafka Streams
  - Apache Flink
---

# Exactly-Once Semantics

In mission-critical applications—especially those involving finance, inventory, billing, or regulatory compliance—the integrity of data is paramount. In distributed, asynchronous data streaming environments, achieving this integrity requires exactly-once semantics (EOS), a guarantee that every record is processed fully, successfully, and only once, even in the face of system failures.

Understanding exactly-once semantics—how it works, why it's technically challenging, and what it costs—is essential for anyone building data pipelines where duplicate processing or data loss would cause incorrect results or compliance violations.

## Understanding Delivery Guarantees: At-Most-Once, At-Least-Once, and Exactly-Once

Data processing guarantees define how a system handles records when failures occur. Distributed systems offer three fundamental delivery semantic models, each representing different trade-offs between reliability, performance, and implementation complexity.

### At-Most-Once Delivery

The system processes a record at most once. If a failure occurs, the system will not retry, potentially leading to data loss. This occurs when producers don't wait for acknowledgment (`acks=0`) or consumers commit offsets before processing messages.

**Use cases:** High-throughput telemetry, metrics collection, or log aggregation where occasional data loss is acceptable and performance is critical. Offers highest throughput and lowest latency because no retry logic or coordination is needed.

### At-Least-Once Delivery

The system guarantees a record will be processed, but failure recovery may cause the record to be processed more than once, leading to data duplication. This is the default robust setting for many message systems and the most common semantic in production.

**Use cases:** Most data pipelines where duplicate processing can be handled through idempotent operations or deduplication logic. For example, updating a customer's current address is naturally idempotent—writing the same address twice produces the same result.

**Configuration:** Producer with `acks=all` and retries enabled; consumer commits offsets only after successful processing.

### Exactly-Once Delivery (EOS)

The system ensures that every record is processed exactly one time, avoiding both data loss and data duplication. Messages are processed precisely once even in the presence of producer retries, broker failures, or consumer crashes.

**Use cases:** Financial transactions, inventory updates, billing systems, or any operation where duplicates cause incorrect results. For example, processing a payment twice charges the customer incorrectly, while missing a payment fails to record revenue.

**Trade-offs:** Slightly higher latency (typically 2-5ms) and lower throughput (10-20% reduction) compared to at-least-once, plus increased configuration and operational complexity.

## The Challenge of Exactly-Once: Why It's Considered "Hard"

Achieving EOS is complex because failures in distributed systems are asynchronous and unpredictable.

### Producer Retries and Duplicate Writes

When a producer sends a message to the broker and doesn't receive an acknowledgment due to a network timeout, it faces ambiguity: Did the broker receive the message but fail before acknowledging? Or did the message never arrive? Without additional mechanisms, retrying risks writing the same message twice (violating exactly-once); not retrying risks data loss (violating at-least-once).

### Consumer Recovery and Duplicate Processing

When a consumer fails after reading a record but before committing its offset, it must restart and will re-read and re-process the last record. The challenge intensifies with stateful operations (aggregations, joins, windows) because the consumer must coordinate reading from source, updating internal state, writing results to sink, and committing source offsets—all atomically.

### Coordinating Distributed State

Exactly-once semantics requires atomic operations across multiple components: producers writing to topics, consumers processing messages, stream processors updating state, and external systems persisting results—all as a single logical transaction. This coordination problem compounds when operations span multiple partitions, topics, or separate systems.

## How Kafka Implements Exactly-Once Semantics

Apache Kafka addresses these challenges through transactions involving idempotent producers, transactional producers, and transactional consumers working together.

### Idempotent Producers: Preventing Duplicate Writes

The idempotent producer guarantees that retrying the same send request will only ever write the record once to the Kafka log. Kafka assigns each producer a unique Producer ID (PID) and tracks a sequence number for each message per partition. When a producer retries, Kafka detects duplicate messages and simply acknowledges success without writing again.

**Configuration:**
```properties
enable.idempotence=true
acks=all
retries=Integer.MAX_VALUE
max.in.flight.requests.per.connection=5
```

### Transactional Producers: Atomic Multi-Partition Writes

Transactional producers extend idempotence to allow atomic writes across multiple partitions and topics. A Transaction Coordinator in the broker manages a two-phase commit process, ensuring either all messages in the batch are committed or none are.

**Configuration:**
```properties
enable.idempotence=true
transactional.id=unique-transactional-id-per-producer-instance
```

**Producer code pattern:**
```java
producer.initTransactions();
try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("output-topic", key, value));
    producer.sendOffsetsToTransaction(offsets, consumerGroupId);
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

This enables the read-process-write cycle to be atomic: read from input topic, process, write to output topic, and commit input offsets all succeed together or all fail together.

### Transactional Consumers: Reading Only Committed Data

Consumers must configure `isolation.level=read_committed` to participate in exactly-once semantics, ensuring they only see messages from committed transactions.

**Configuration:**
```properties
isolation.level=read_committed
enable.auto.commit=false
```

Together, these three mechanisms provide end-to-end exactly-once semantics within Kafka.

## Exactly-Once in Stream Processing: Flink and Kafka Streams

While Kafka provides the transactional messaging layer, stream processing engines manage state correctly during failures through checkpointing.

### Kafka Streams

When configured with `processing.guarantee=exactly_once_v2`, Kafka Streams coordinates consumer offsets, operator state snapshots, and output commits within a single Kafka transaction. When a failure occurs, Kafka Streams rolls back to the last successful transaction and resumes processing without loss or duplication.

### Apache Flink

Flink achieves exactly-once semantics through distributed checkpointing coordinated with Kafka transactions using two-phase commit. Flink periodically snapshots operator state, writes output records to Kafka without committing, then commits all transactions together only after all operators successfully complete their checkpoint.

## Achieving End-to-End EOS: Source, Processor, and Sink

True end-to-end exactly-once semantics requires coordination across all three stages.

**Source Requirements:** The source must be re-readable, allowing consumers to reset positions and replay data after failures. Kafka's durable log architecture excels here.

**Processor Requirements:** The processor must be transactional, coordinating state updates with input consumption and output production. Flink and Kafka Streams provide this via distributed checkpointing and two-phase commits.

**Sink Requirements:** The sink must be either idempotent (safely handling duplicate writes like Cassandra or key-value stores) or transactional (participating in two-phase commit like PostgreSQL or MySQL). Non-compliant sinks require application-level deduplication.

## Configuration and Trade-offs

### Performance Overhead

Enabling EOS introduces measurable costs:

- **Latency Impact:** Increases by 2-5 milliseconds due to transaction coordination
- **Throughput Reduction:** Decreases by 10-20% due to coordination messages and transaction markers
- **Broker Load:** Increases due to tracking transaction state and managing coordinators
- **Operational Complexity:** Requires monitoring transaction status and handling zombie transactions

### When Exactly-Once Is Worth It

**Choose exactly-once semantics when:**
- Duplicates cause incorrect results (financial transactions, inventory updates, billing)
- Applications maintain monetary values or non-idempotent state
- Compliance requires guaranteed processing (audit trails, regulatory reporting)
- The cost of incorrect data exceeds the performance overhead

**Consider at-least-once when:**
- Downstream operations are naturally idempotent
- Performance requirements are extreme (sub-millisecond latency)
- The application can deduplicate through business logic

## Monitoring and Validating Exactly-Once Behavior

Operating exactly-once pipelines requires specific monitoring:

**Key Metrics:**
- **Transaction Coordinator Lag:** Indicates broker overload or configuration issues
- **Aborted Transactions:** Spikes suggest application errors or infrastructure issues
- **Producer Transaction Timeouts:** Detects slow processing or oversized transactions
- **Fence Occurrences:** Frequent fencing suggests configuration problems
- **Zombie Transaction Detection:** Transactions remaining open can block downstream consumers

**Validation Techniques:**
- End-to-end counting with unique identifiers
- Application-level duplicate detection for validation
- Transaction state inspection using Kafka tools
- State consistency checks comparing checkpoint state with topic offsets

## Governance and Compliance

In enterprise environments, governance is essential to ensure EOS is correctly configured. Platforms like Conduktor provide real-time visibility into transaction status across all Kafka clusters, enabling operators to identify and abort zombie transactions, enforce policies requiring EOS for sensitive data streams, track which applications have exactly-once enabled, and monitor transaction health metrics in centralized dashboards.

## Summary

Exactly-once semantics is the highest data integrity guarantee in data streaming, essential for maintaining correct state in financial, billing, inventory, and compliance-driven applications.

**Why It Matters:** EOS eliminates both data loss and data duplication by ensuring every record is processed one and only one time. For financial transactions and regulatory compliance, exactly-once semantics prevents incorrect results from duplicate processing or missing data.

**How Teams Approach It Today:** Organizations achieve end-to-end EOS by coordinating transactional guarantees from Kafka source through stream processor to sink. Teams carefully evaluate when exactly-once justifies the 10-20% performance overhead, reserving it for critical workflows while using at-least-once for general pipelines.

**Where Platforms Fit:** Governance and observability platforms provide enterprise control for managing exactly-once configurations at scale, tracking proper settings, monitoring transaction states, enforcing policies, and ensuring compliance with regulatory requirements for data integrity.

## Sources and References

- Apache Software Foundation. [Apache Kafka Documentation: Semantics](https://kafka.apache.org/documentation/#semantics)
- Kreps, Jay. [Exactly-once Semantics are Possible: Here's How Apache Kafka Does It](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/). Confluent Blog, 2017.
- Apache Software Foundation. [Apache Flink Documentation: Fault Tolerance and Checkpointing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/)
- Apache Kafka. [KIP-98: Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)