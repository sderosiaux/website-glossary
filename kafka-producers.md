---
title: "Kafka Producers"
description: Kafka producers write records to topics. They control encoding, routing to partitions, delivery guarantees, and throughput. This guide explains the producer API end to end and shows where producers fit in a modern streaming stack.
topics:
  - Kafka
  - Producers
  - Event Streaming
  - Message Delivery
---
## What a Kafka Producer Does

A Kafka producer sends records to a topic and routes each record to a partition. The client connects to brokers, fetches metadata, and batches writes for throughput. Producers control delivery policy, retries, compression, and partition choice, which sets latency, cost, and durability.

### API notes

A record carries a topic, optional key, value, and optional headers. The `KafkaProducer` is thread safe, so one shared instance per process often works best. You can send asynchronously with a callback or call `Future.get()` for sync behavior. Set a clear `client.id`, since brokers expose it in logs and metrics and this speeds triage.

### Example: CLI quick start

```
kafka-console-producer --topic orders --bootstrap-server localhost:9092 \
  --property parse.key=true --property key.separator=:
```

Each `key:value` line becomes a keyed record.

## Setup and Serialization

Producers must serialize keys and values into bytes. A schema keeps changes safe across teams and time.

Pick a format and a registry. Avro, Protobuf, and JSON Schema pair well with a Schema Registry that stores versions and enforces compatibility.

Key properties:

* `bootstrap.servers` for initial brokers.
* `key.serializer` and `value.serializer` for encoding.
* `client.id` for traceability.
* `compression.type` to reduce bytes on the wire.
* `delivery.timeout.ms`, `request.timeout.ms`, and `retries` for retry policy.

### Example: Java producer with Avro and callback

```java
Properties p = new Properties();
p.put("bootstrap.servers", "broker1:9092,broker2:9092");
p.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
p.put("value.serializer", "io.confluent.kafka.serializers.KafkaAvroSerializer");
p.put("schema.registry.url", "http://registry:8081");
p.put("client.id", "payments-prod-v1");
p.put("enable.idempotence", "true");

try (Producer<String, GenericRecord> producer = new KafkaProducer<>(p)) {
  ProducerRecord<String, GenericRecord> rec = new ProducerRecord<>("payments", "user-42", value);
  producer.send(rec, (md, ex) -> {
    if (ex != null) {
      // log error with client.id, topic, partition
    } else {
      // md.topic(), md.partition(), md.offset()
    }
  });
  producer.flush(); // optional if you close soon after
}
```

The try-with-resources block calls `close()`, which flushes in-flight records and releases resources.

## Delivery Guarantees and Acknowledgments

Delivery behavior depends on acks, retries, idempotence, and transactions.

* **At-most-once** sends do not retry. You can lose data on faults.
* **At-least-once** sends retry. You can see duplicates.
* **Exactly-once processing** uses idempotent producers and transactions with read-committed consumers to avoid both loss and duplicates in a pipeline.

Key settings:

* `acks=0` returns before storage. Lowest safety.
* `acks=1` waits for the leader write.
* `acks=all` waits for the leader and in-sync replicas. Use with topic `min.insync.replicas`.
* `enable.idempotence=true` drops duplicates created by retries within a producer session.
* Transactions use a stable `transactional.id`, `initTransactions`, `beginTransaction`, and `commitTransaction`, with consumers set to `isolation.level=read_committed`.

### Error handling checklist

Treat these as retriable: `NOT_LEADER_FOR_PARTITION`, `NETWORK_EXCEPTION`, `UNKNOWN_TOPIC_OR_PARTITION`, `REQUEST_TIMED_OUT`. Treat these as non-retriable: `INVALID_CONFIG`, `TOPIC_AUTHORIZATION_FAILED`, `RECORD_TOO_LARGE`. Route non-retriable failures to a dead-letter topic or alert the team, then fix the cause. Handle `NotEnoughReplicas` on `acks=all` with `min.insync.replicas` by backing off or failing fast.

### Safe write profile

```properties
acks=all
enable.idempotence=true
retries=2147483647
max.in.flight.requests.per.connection=5
delivery.timeout.ms=120000
```

If you need strict per-key order during retries, set `max.in.flight.requests.per.connection=1` and accept lower throughput.

## Keys, Partitions, and Ordering

Kafka guarantees order per partition per producer session. Your key choice decides partition placement and thus locality.

Practical rules:

* Use a stable business key, for example `user_id` or `order_id`, to keep related events together.
* Records without keys use a sticky strategy that forms larger batches while spreading load.
* Hot keys can overload a single partition. Use a composite key, a salted hash for the hottest keys, or a custom partitioner.
* Increasing partition count changes key-to-partition mapping. Plan the change during low traffic and confirm ordering needs.

### Quick check for routing

Send a few `key:message` pairs with the console producer, then consume with partition info. You should see all records for a key in the same partition, in order.

## Batching, Backpressure, and Throughput Tuning

The producer batches per partition to improve throughput. Larger batches raise efficiency and compression ratio at some latency cost.

Levers that matter:

* `batch.size` sets the target batch bytes.
* `linger.ms` lets the client wait briefly to coalesce records. Values around 1 to 5 ms help throughput while keeping tail latency reasonable.
* `compression.type` trades CPU for bytes. LZ4 works for speed with modest savings. Zstd gives strong savings with more CPU.
* `buffer.memory` bounds the client buffer. When full, `send()` blocks up to `max.block.ms` or throws.
* `max.request.size` and broker `message.max.bytes` cap record size. Use chunking or external object storage for very large payloads.

Watch `record-send-rate`, `record-error-rate`, `request-latency-avg`, p95 or p99 latency, `compression-rate-avg`, average batch size, and `bufferpool-wait-ratio`. Rising retries, timeouts, or buffer waits point to broker load or network issues. Tune, then measure again.

## Where It Fits in Streaming Architectures

Producers sit at the edge of a streaming stack and shape downstream state and cost.

Common placements:

* **Microservices** publish domain events that drive other services.
* **CDC to Kafka** uses Debezium to read database logs and publish to topics. Stable schemas and keys reduce reprocess churn.
* **Flink** jobs read topics and write results to Kafka with exactly-once sinks that coordinate with Kafka transactions.
* **Kafka Streams** reads and writes topics inside the same process. Idempotent or transactional producers prevent duplicate outputs on recovery.
* **Kafka Connect** acts as a managed producer for databases and SaaS sources.
* **ETL to lakehouses** publishes to topics that hydrate Iceberg or Delta tables through sinks.

Design notes:

* Pick keys that match downstream grouping, for example session joins on `session_id`.
* Use compatibility rules in the registry to protect consumers.
* If the pipeline needs end-to-end exactly-once, combine idempotent producers, transactions, and read-committed consumers.

## Governance and Platform Support

The producer is the first gate for safety and reuse. Teams need clear controls on who can write, what shapes are allowed, and how changes get tracked.

What to enforce:

* **RBAC and ACLs** for write access, for example a service account with write to `orders-*`.
* **Schema policy** for backward or full compatibility, required fields like `event_time` or `tenant_id`, and validation in CI.
* **Field protection** with masking or encryption on sensitive fields in transit or at a gateway.
* **Quotas** per client ID to protect shared clusters.
* **Audit and lineage** that record who wrote, when, with which schema version, and how downstream tables or features depend on that topic.
* **Standard producer libs** or config bundles to keep defaults consistent across teams.

Where governance platforms help:
Governance platforms help teams manage producer access with RBAC, validate schemas before publish, apply dynamic masking on sensitive fields, and keep a complete audit trail of produce operations across clusters. They surface producer activity and errors, including replication shortfalls and authorization failures, in one view. They link producers to topics and to downstream consumers to support impact analysis.

## Summary

Producers turn domain events and CDC streams into durable topic data. Their settings for serialization, acks, retries, batching, and keys decide reliability, latency, and cost for the whole stack. Streaming engines such as Flink and Kafka Streams depend on those choices for correct joins, windows, and state. Teams reach stable results with schema-aware encoding, safe acks with idempotence, tuned batching, and clear key strategy. Governance platforms add RBAC, schema policy, masking, audit, lineage, quotas, and shared defaults, which keeps producer changes safe and traceable at scale.

## Sources and References

* Apache Kafka documentation, Producer API and configuration: [https://kafka.apache.org/documentation/](https://kafka.apache.org/documentation/)
* Confluent documentation, Producer configs, idempotence, transactions, and exactly-once semantics: [https://docs.confluent.io/platform/current/clients/producer.html](https://docs.confluent.io/platform/current/clients/producer.html)
* Apache Flink documentation, Kafka connector and sinks: [https://nightlies.apache.org/flink/flink-docs-stable/docs/connectors/datastream/kafka/](https://nightlies.apache.org/flink/flink-docs-stable/docs/connectors/datastream/kafka/)
* Debezium documentation, Architecture and Kafka topics: [https://debezium.io/documentation/](https://debezium.io/documentation/)
* Kafka Improvement Proposals index, producer design background: [https://cwiki.apache.org/confluence/display/KAFKA/Kafka+Improvement+Proposals](https://cwiki.apache.org/confluence/display/KAFKA/Kafka+Improvement+Proposals)
](http://localhost:4321/articles/kafka-producers-sending-messages-to-topics)
