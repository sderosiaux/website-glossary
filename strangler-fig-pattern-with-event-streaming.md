---
title: "Strangler Fig Pattern with Event Streaming"
description: "Learn how the Strangler Fig Pattern enables gradual system modernization through event streaming. Discover implementation strategies, real-world examples, and best practices for migrating legacy systems without downtime using platforms like Apache Kafka."
topics:
  - Architecture Patterns
  - System Migration
  - Event Streaming
  - Microservices
  - Apache Kafka
---

Migrating legacy systems to modern architectures is one of the most challenging tasks in software engineering. The Strangler Fig Pattern, combined with event streaming platforms, offers a proven approach to incrementally replace old systems while maintaining business continuity.

## What is the Strangler Fig Pattern?

The Strangler Fig Pattern is an architectural migration strategy named after the strangler fig tree, which germinates in the canopy of a host tree and gradually grows downward, eventually replacing the host entirely. Martin Fowler introduced this concept to software architecture in 2004 as a safer alternative to risky "big bang" rewrites.

In software terms, the pattern works by incrementally building a new system around an existing legacy system. Rather than replacing everything at once, you create new functionality alongside the old system, gradually routing more traffic to the new implementation until the legacy system can be safely decommissioned.

The pattern consists of three main phases:

**Transform**: New functionality is built in the new system while the old system remains operational.

**Coexist**: Both systems run in parallel, with a facade or routing layer directing requests to the appropriate system.

**Eliminate**: Once all functionality has been migrated and validated, the legacy system is retired.

## Why Traditional Migration Approaches Fail

Large-scale system rewrites have a notorious failure rate. The "big bang" approach—where an entire system is replaced in a single deployment—carries several critical risks:

**Extended development cycles** create the risk that business requirements change before the new system launches. Teams often find themselves building features that are already obsolete.

**Integration complexity** increases exponentially when trying to switch everything simultaneously. Database schemas, API contracts, and business logic must all align perfectly on day one.

**Rollback difficulty** becomes nearly impossible once a complete replacement goes live. If critical issues emerge, organizations often have no graceful path back to the working legacy system.

**Testing gaps** inevitably emerge when trying to validate every edge case and integration point before going live. Real-world usage patterns always reveal scenarios that testing missed.

The Strangler Fig Pattern addresses these challenges by allowing incremental progress, continuous validation, and the ability to pause or reverse course at any point.

## Event Streaming as the Migration Backbone

Event streaming platforms like Apache Kafka (4.0+), Pulsar, and AWS Kinesis provide the ideal infrastructure for implementing the Strangler Fig Pattern. They enable old and new systems to coexist by acting as a neutral communication layer. Modern Kafka deployments use KRaft mode (removing the ZooKeeper dependency), simplifying operations during migration projects. For foundational understanding of Kafka, see [Apache Kafka](https://conduktor.io/glossary/apache-kafka).

### How Event Streaming Enables Gradual Migration

Event streaming platforms solve several critical migration challenges:

**Decoupling through events**: Instead of tight coupling through direct API calls or shared databases, systems communicate through events. This allows the old and new systems to evolve independently during the migration period. For foundational concepts, see [Event-Driven Architecture](https://conduktor.io/glossary/event-driven-architecture).

**Dual-write capability**: Events can be simultaneously consumed by both legacy and new systems. This enables parallel processing during the transition, allowing teams to validate the new system's behavior against the proven legacy system.

**Change Data Capture (CDC)**: Tools like Debezium can capture changes from legacy databases (inserts, updates, deletes) and publish them as events to Kafka. This allows the new system to stay synchronized with the legacy system without invasive code changes to the legacy application. For detailed CDC implementation strategies, see [What is Change Data Capture (CDC) Fundamentals](https://conduktor.io/glossary/what-is-change-data-capture-cdc-fundamentals).

**Event replay**: Streaming platforms typically retain events for extended periods. This enables the new system to replay historical events for testing, validation, or catching up after deployment.

**Schema evolution**: Modern streaming platforms support schema registries—centralized repositories that store and enforce data structure contracts. These registries manage how event schemas change over time, ensuring that producers and consumers remain compatible even as data models evolve. This allows the new system to introduce improved data models while maintaining compatibility with legacy consumers.

### Implementation Patterns

Several patterns emerge when using event streaming for strangler fig migrations:

**Event forwarding**: The legacy system publishes events that both old and new systems consume. Traffic is gradually shifted to the new system by changing which consumer's output is used downstream.

**Event shadowing**: The new system consumes the same events as the legacy system but initially operates in "shadow mode," processing events without affecting production. Teams compare outputs to validate correctness before switching over.

**Bidirectional sync**: During transition periods, some data may flow back from the new system to the legacy system through events. This maintains consistency when some features remain in the old system while others have migrated.

## Real-World Implementation Example

Consider an e-commerce company migrating from a monolithic order management system to microservices. For more on microservices patterns with event streaming, see [Event-Driven Microservices Architecture](https://conduktor.io/glossary/event-driven-microservices-architecture).

### Initial State

The legacy monolith handles order creation, inventory checks, payment processing, and fulfillment through a shared database. Making changes requires coordinating across teams and deploying the entire application.

### Migration Strategy with Event Streaming
![### Migration Strategy with Event Streaming](images/diagrams/strangler-fig-pattern-with-event-streaming-0.webp)
<!-- ORIGINAL_DIAGRAM
```
      Strangler Fig Migration: Phase by Phase

Phase 1: Event Infrastructure
┌────────────────────────────────────────┐
│     Legacy Monolith                    │
│  ┌──────────────────────────────────┐  │
│  │ Orders │ Inventory │ Payment     │  │
│  └────┬───────────────────────────┬─┘  │
│       │                           │    │
└───────┼───────────────────────────┼────┘
        │ CDC                       │
        └───────────┬───────────────┘
                    ▼
            ┌──────────────┐
            │  Kafka       │
            └──────────────┘


Phase 3: Partial Migration
┌────────────────────────────────────────┐
│     Legacy Monolith                    │
│  ┌──────────────────────────────────┐  │
│  │ Orders │          │ Fulfillment  │  │
│  └────┬───────────────────────────┬─┘  │
└───────┼───────────────────────────┼────┘
        │                           │
        └───────┬───────────────────┘
                ▼
        ┌──────────────┐
        │    Kafka     │
        └───┬──────┬───┘
            │      │
    ┌───────┘      └───────┐
    ▼                      ▼
┌─────────┐          ┌──────────┐
│Inventory│          │ Payment  │
│ Service │          │ Service  │
└─────────┘          └──────────┘
   NEW                   NEW


Phase 5: Complete Migration
        ┌──────────────┐
        │    Kafka     │
        └───┬──┬───┬───┘
            │  │   │
    ┌───────┘  │   └────────┐
    ▼          ▼            ▼
┌─────────┐ ┌─────┐  ┌──────────┐
│ Order   │ │Invty│  │ Payment  │
│ Service │ │Svc  │  │ Service  │
└─────────┘ └─────┘  └──────────┘

     Legacy Monolith: DECOMMISSIONED ✓
```
-->

**Phase 1: Event Infrastructure**
Deploy Kafka as the event backbone. Implement CDC on the legacy database to capture order events. The legacy system continues operating unchanged.

Example event structure published from the legacy database via CDC:

```json
{
  "schema": {
    "type": "struct",
    "fields": [
      {"field": "order_id", "type": "string"},
      {"field": "customer_id", "type": "string"},
      {"field": "total_amount", "type": "double"},
      {"field": "status", "type": "string"},
      {"field": "created_at", "type": "int64"}
    ]
  },
  "payload": {
    "order_id": "ORD-12345",
    "customer_id": "CUST-789",
    "total_amount": 149.99,
    "status": "CREATED",
    "created_at": 1704902400000
  },
  "metadata": {
    "operation": "INSERT",
    "source": "legacy_orders_table",
    "timestamp": 1704902400123
  }
}
```

**Phase 2: First Service - Inventory**
Build a new inventory microservice that consumes order events from Kafka. Run it in shadow mode, comparing its inventory calculations against the legacy system. After validation, route inventory queries to the new service while order creation remains in the monolith.

Example Debezium CDC connector configuration for capturing legacy database changes:

```json
{
  "name": "legacy-orders-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "legacy-db.company.com",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${DB_PASSWORD}",
    "database.dbname": "orders_db",
    "table.include.list": "public.orders,public.inventory",
    "topic.prefix": "legacy",
    "plugin.name": "pgoutput",
    "publication.autocreate.mode": "filtered",
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false"
  }
}
```

**Phase 3: Payment Service**
Extract payment processing into a separate service. Publish payment events that both the legacy system and new services consume. Gradually route payment requests to the new service.

**Phase 4: Order Service**
Create a new order service that publishes order events directly to Kafka. Implement feature flags to route a percentage of orders through the new service. Monitor metrics and gradually increase the percentage.

**Phase 5: Decommission**
Once all functionality has migrated and the legacy system receives no traffic for a defined period, shut it down.

Throughout this process, the event stream provides a clear audit trail, enables rollback if issues arise, and allows independent scaling of each service.

## Challenges and Best Practices

While event streaming simplifies strangler fig migrations, several challenges require careful consideration:

### Data Consistency During Dual Writes

When both systems are active, maintaining data consistency becomes complex. Events may be processed in different orders, or one system may fail while the other succeeds.

**Best practice**: Implement idempotent event handlers—handlers that produce the same result when processing the same event multiple times—and use event IDs to detect duplicates. Design for eventual consistency rather than strict transactional guarantees during the transition period. For detailed patterns, see [Exactly Once Semantics in Kafka](https://conduktor.io/glossary/exactly-once-semantics-in-kafka).

### Schema Management

As systems evolve, event schemas will change. Breaking changes can disrupt consumers.

**Best practice**: Use a schema registry (such as Apicurio Registry, AWS Glue Schema Registry, or Conduktor's schema management features) to enforce compatibility rules. Adopt backward and forward compatible schema evolution strategies. For detailed coverage of schema management patterns, see [Schema Registry and Schema Management](https://conduktor.io/glossary/schema-registry-and-schema-management). Conduktor provides schema management interfaces that make it easier to visualize schema evolution and validate compatibility across environments.

### Monitoring and Observability

With multiple systems processing the same events, identifying the source of issues becomes harder.

**Best practice**: Implement distributed tracing with correlation IDs across all services. Monitor lag on all consumer groups to detect processing delays using tools like Kafka Lag Exporter, Burrow, or Conduktor. For detailed strategies, see [Consumer Lag Monitoring](https://conduktor.io/glossary/consumer-lag-monitoring) and [Distributed Tracing for Kafka Applications](https://conduktor.io/glossary/distributed-tracing-for-kafka-applications). Conduktor provides centralized visibility into consumer lag, topic throughput, and data quality issues across your streaming infrastructure, making it easier to identify problems during complex migrations.

### Event Ordering

Kafka guarantees ordering within a partition (a partition is a logical subdivision of a topic where related events are grouped), but distributed processing can still create race conditions across different partitions.

**Best practice**: Design your partitioning strategy carefully, typically keying events by entity ID (order ID, customer ID, etc.) to ensure all events for the same entity go to the same partition. Implement handlers that can tolerate out-of-order events when necessary. For example, all events for order "ORD-12345" should use that order ID as the partition key, ensuring they're processed sequentially.

### Testing Strategy

Testing becomes more complex when events flow through multiple systems.

**Best practice**: Implement contract testing for event schemas. Use event replay to test new services with production-like data. Create isolated environments where the entire event-driven system can be validated end-to-end. For handling processing failures during testing and production, see [Dead Letter Queues for Error Handling](https://conduktor.io/glossary/dead-letter-queues-for-error-handling).

### Gradual Traffic Shifting

Moving traffic from old to new systems requires careful orchestration.

**Best practice**: Use feature flags or routing rules to control what percentage of traffic uses the new system. Start with a small percentage, monitor carefully, and increase gradually. Keep the ability to instantly route traffic back to the legacy system if issues arise.

## When Strangler Fig Pattern Makes Sense

The Strangler Fig Pattern with event streaming works best in specific scenarios:

**Large, complex systems** where a complete rewrite would take months or years benefit from incremental migration.

**Systems with ongoing business changes** need to continue evolving during migration. The strangler approach allows new features to be built in the new architecture while migration continues.

**Risk-averse organizations** that cannot tolerate extended outages or the possibility of a failed big-bang launch.

**Greenfield event-driven architectures** provide an excellent opportunity to introduce event streaming while maintaining the existing system.

The pattern may not be optimal for:

**Simple applications** where a complete rewrite can happen in weeks.

**End-of-life systems** with no ongoing development, where a replacement can be built and tested offline.

**Tightly coupled systems** without clear boundaries, where extracting individual components creates more complexity than value.

## Summary

The Strangler Fig Pattern provides a pragmatic path for modernizing legacy systems while maintaining business continuity. Event streaming platforms like Apache Kafka 4.0+ (with simplified KRaft-based operations) serve as the ideal backbone for this approach, enabling gradual migration through decoupled, event-driven communication.

Key takeaways:

- The Strangler Fig Pattern allows incremental replacement of legacy systems, avoiding the risks of big-bang rewrites
- Event streaming platforms (Apache Kafka 4.0+ with KRaft mode) provide the infrastructure for old and new systems to coexist through event-driven communication
- Change Data Capture (using tools like Debezium), dual-write patterns, and event replay are essential techniques for streaming-based migrations
- Managing schema evolution, data consistency, and monitoring requires careful planning, appropriate tooling, and operational platforms like Conduktor
- Idempotent event handlers and proper partition key strategies ensure data consistency and ordering during migrations
- Code examples and concrete implementation patterns help teams translate architectural concepts into working systems

Successful migrations require patience, careful planning, and a commitment to incremental progress. By combining the Strangler Fig Pattern with modern event streaming platforms, organizations can modernize their systems while continuing to deliver value to customers.

## Related Concepts

- [Event-Driven Architecture](https://conduktor.io/glossary/event-driven-architecture) - Architectural foundation for streaming-based migrations
- [Schema Registry and Schema Management](https://conduktor.io/glossary/schema-registry-and-schema-management) - Managing schema evolution during system migrations
- [Backpressure Handling in Streaming Systems](https://conduktor.io/glossary/backpressure-handling-in-streaming-systems) - Managing load during parallel system operation

## Sources and References

1. Fowler, Martin. "StranglerFigApplication." martinfowler.com, 2004. https://martinfowler.com/bliki/StranglerFigApplication.html - The original description of the Strangler Fig Pattern.

2. Newman, Sam. "Building Microservices: Designing Fine-Grained Systems." O'Reilly Media, 2021. Comprehensive coverage of migration patterns and event-driven architectures.

3. Confluent. "Apache Kafka Documentation - Use Cases: Modernizing Legacy Systems." https://kafka.apache.org/documentation/ - Official documentation on using Kafka for system modernization.

4. Kleppmann, Martin. "Designing Data-Intensive Applications." O'Reilly Media, 2017. In-depth coverage of event streaming patterns and data consistency in distributed systems.

5. Richardson, Chris. "Microservices Patterns: With Examples in Java." Manning Publications, 2018. Detailed patterns for microservices migration including event-driven approaches.
