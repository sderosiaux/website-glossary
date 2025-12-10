---
title: "Kafka MirrorMaker 2 for Cross-Cluster Replication"
description: "Kafka MirrorMaker 2 enables reliable cross-cluster replication for disaster recovery and multi-region deployments. Learn its architecture and best practices."
topics:
  - kafka
  - replication
  - disaster-recovery
  - multi-cluster
  - kafka-connect
---

# Kafka MirrorMaker 2 for Cross-Cluster Replication

Modern data streaming architectures often span multiple Kafka clusters across different data centers, cloud regions, or even cloud providers. Organizations need robust solutions to replicate data between these clusters for disaster recovery, regulatory compliance, low-latency regional access, and data aggregation. Kafka MirrorMaker 2 (MM2) is the Apache Kafka project's solution for reliable, scalable cross-cluster replication.

## What is Kafka MirrorMaker 2

MirrorMaker 2 is a Kafka Connect-based replication tool that copies data between Apache Kafka clusters. It serves as the successor to the original MirrorMaker (now called MirrorMaker 1), addressing several critical limitations of its predecessor.

While MirrorMaker 1 was a simple consumer-producer pair that could replicate topic data, it lacked essential features for production use. MM2 introduces significant improvements including automatic topic creation, consumer group offset synchronization, access control list (ACL) replication, and exactly-once semantics support. These enhancements make MM2 suitable for enterprise-grade replication scenarios where data consistency and operational simplicity matter.

MM2 was introduced in Apache Kafka 2.4 through KIP-382 and has become the recommended approach for cross-cluster replication. It leverages the Kafka Connect framework, which means it benefits from Connect's scalability, fault tolerance, and operational characteristics.

## Architecture and Components

MirrorMaker 2 consists of three main connector types that work together to provide comprehensive replication:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Source Cluster (us-west)                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                       │
│  │  orders   │  │ inventory │  │ shipments │                       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                       │
└────────┼──────────────┼──────────────┼─────────────────────────────┘
         │              │              │
         │              │              │  MirrorMaker 2 Connectors
         ▼              ▼              ▼  ┌────────────────────────┐
    ┌────────────────────────────────────┤ MirrorSourceConnector  │
    │                                    │ (Data Replication)     │
    │  ┌─────────────────────────────────┤ MirrorCheckpointConn.  │
    │  │                                 │ (Offset Sync)          │
    │  │  ┌──────────────────────────────┤ MirrorHeartbeatConn.   │
    │  │  │                              │ (Health Monitoring)    │
    ▼  ▼  ▼                              └────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│                       Target Cluster (us-east)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │us-west.orders│  │us-west.invent│  │us-west.shipm │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

**MirrorSourceConnector** handles the core data replication task. It consumes records from topics in the source cluster and produces them to corresponding topics in the target cluster. The connector preserves message keys, values, headers, and timestamps, ensuring data fidelity across clusters.

**MirrorCheckpointConnector** synchronizes consumer group offsets between clusters. This is crucial for disaster recovery scenarios where applications need to fail over from one cluster to another. By tracking which offsets have been replicated, the checkpoint connector enables applications to resume consumption from the correct position after a failover.

**MirrorHeartbeatConnector** monitors replication health by emitting heartbeat messages. These heartbeats help track replication lag and detect connectivity issues between clusters.

All three connectors run within the Kafka Connect framework, either in standalone mode for simple setups or distributed mode for production deployments. The distributed mode provides fault tolerance and horizontal scaling, allowing MM2 to handle high-throughput replication across large Kafka deployments.

One notable aspect of MM2's design is its topic naming convention. By default, replicated topics are prefixed with the source cluster name. For example, a topic named `orders` in a cluster designated as `us-west` would appear as `us-west.orders` in the target cluster. This naming pattern prevents conflicts and makes the data lineage clear, though it can be customized if needed.

## Replication Patterns and Use Cases

MirrorMaker 2 supports several replication patterns, each suited to different business and technical requirements:

**Active-Passive Replication** is the most common pattern for disaster recovery. A primary cluster handles all production traffic while MM2 continuously replicates data to a secondary cluster in a different region or availability zone. If the primary cluster fails, applications can fail over to the secondary cluster. The checkpoint connector ensures that consumers can resume from the correct offset, minimizing data loss and duplication.

```
Active-Passive Pattern:

  ┌──────────────┐
  │ Producers    │
  └──────┬───────┘
         │ (writes)
         ▼
  ┌─────────────────┐                  ┌─────────────────┐
  │  Primary (US-E) │────MM2──────────▶│  Standby (US-W) │
  │  (Active)       │  Replication     │  (Passive)      │
  └────────┬────────┘                  └─────────────────┘
           │
           │ (reads)
           ▼
  ┌──────────────┐
  │  Consumers   │
  └──────────────┘

  On Failover →  Applications switch to Standby cluster
```

For example, a financial services company might run its primary Kafka cluster in US-East with active replication to a standby cluster in US-West. If the US-East data center experiences an outage, trading applications can quickly switch to the US-West cluster using the synchronized consumer offsets.

**Active-Active Replication** involves bidirectional replication where multiple clusters both produce and consume data. This pattern supports multi-region deployments where applications in different geographies need low-latency access to data. However, active-active replication requires careful handling of potential data conflicts and cycles in the replication topology.

**Hub-and-Spoke Aggregation** centralizes data from multiple regional or edge clusters into a central cluster for analytics, reporting, or cross-regional data access. For instance, a global retail company might replicate sales data from clusters in different countries to a central data hub for enterprise-wide analytics.

**Fan-Out Distribution** does the opposite, replicating data from a central cluster to multiple regional clusters. This pattern works well for distributing reference data, configuration updates, or content that needs to be available locally in multiple regions.

## Configuration and Deployment

Deploying MirrorMaker 2 requires configuring source and target cluster connections, specifying which topics to replicate, and tuning performance parameters.

A basic MM2 configuration defines cluster aliases, connection details, and replication flows. Here's a simplified example:

```properties
clusters = source, target
source.bootstrap.servers = source-kafka:9092
target.bootstrap.servers = target-kafka:9092

source->target.enabled = true
source->target.topics = orders.*, inventory.*, shipments.*

replication.factor = 3
offset-syncs.topic.replication.factor = 3
checkpoints.topic.replication.factor = 3
```

This configuration establishes replication from the `source` cluster to the `target` cluster for all topics matching the patterns `orders.*`, `inventory.*`, and `shipments.*`. The replication factor settings ensure that MM2's internal topics are properly replicated for fault tolerance.

Key configuration considerations include topic filtering (using regex patterns), replication factor settings, security credentials (when clusters use authentication), and performance tuning parameters like buffer sizes and number of tasks. For high-throughput environments, increasing the number of tasks allows MM2 to parallelize replication across multiple partitions and topics.

MM2 can be deployed as a dedicated cluster or co-located with existing Kafka Connect infrastructure. Many organizations run MM2 on dedicated hardware close to the source cluster to minimize network latency and egress costs.

## Monitoring and Operational Considerations

Effective monitoring is essential for maintaining healthy cross-cluster replication. The primary metric to track is replication lag, which measures how far behind the source cluster the target cluster has fallen. High replication lag can indicate network issues, insufficient MM2 capacity, or problems with the target cluster.

MM2 exposes replication lag through JMX metrics and also records checkpoint information in Kafka topics. The `record-age-ms` metric shows the age of the oldest record waiting to be replicated, while `replication-latency-ms` measures the time taken to replicate records.

Operational challenges include managing topic configuration drift between clusters, handling schema evolution, and coordinating failover procedures. When failing over to a backup cluster, teams must ensure that consumer groups start from the correct offsets and that producers switch to the new cluster atomically to avoid data inconsistencies.

Platforms like Conduktor provide visibility into multi-cluster Kafka environments, making it easier to monitor replication health, track lag across clusters, and manage MM2 configurations. This visibility becomes particularly valuable in complex environments with multiple replication flows and many clusters.

Another operational consideration is network bandwidth and costs. Replicating high-throughput topics across cloud regions can incur significant egress charges. Organizations should monitor bandwidth usage and consider compression, topic filtering, and strategic cluster placement to manage costs.

## MirrorMaker 2 in the Data Streaming Ecosystem

Cross-cluster replication is a foundational capability for building resilient real-time data streaming architectures. In modern streaming platforms, data flows continuously through Kafka topics, feeding stream processing applications built with Kafka Streams or Apache Flink, populating real-time dashboards, and triggering automated business processes.

When these streaming pipelines span multiple regions or require disaster recovery capabilities, MirrorMaker 2 becomes an essential component. It ensures that the streaming data infrastructure remains available even during regional outages, supports compliance requirements for data sovereignty, and enables global applications to access data with minimal latency.

MM2 integrates naturally with the broader Kafka ecosystem. Since it's built on Kafka Connect, it works alongside other connectors that move data in and out of Kafka. Stream processing applications can consume from replicated topics without modification, and schema registries can be synchronized using separate replication strategies to maintain compatibility across clusters.

For organizations running complex streaming platforms with multiple Kafka clusters, Connect clusters, stream processing applications, and data pipelines, managing the entire topology becomes challenging. This is where unified platform solutions can help by providing centralized visibility, governance, and operational controls across the distributed streaming infrastructure.

## Summary

Kafka MirrorMaker 2 provides enterprise-grade cross-cluster replication capabilities that are essential for modern data streaming architectures. Its Connect-based architecture, support for multiple replication patterns, and features like offset synchronization make it significantly more capable than its predecessor.

Whether implementing disaster recovery with active-passive replication, enabling global applications with active-active patterns, or aggregating data from distributed edge clusters, MM2 offers the flexibility and reliability needed for production deployments. Successful MM2 implementations require careful attention to configuration, monitoring, and operational procedures, particularly around failover scenarios.

As organizations continue to adopt multi-region, multi-cloud, and hybrid cloud architectures, tools like MirrorMaker 2 become increasingly important for maintaining data availability, consistency, and performance across distributed streaming platforms.

## Sources and References

1. [Apache Kafka Documentation - MirrorMaker 2.0](https://kafka.apache.org/documentation/#georeplication) - Official Apache Kafka documentation covering MM2 architecture and configuration
2. [KIP-382: MirrorMaker 2.0](https://cwiki.apache.org/confluence/display/KAFKA/KIP-382%3A+MirrorMaker+2.0) - Kafka Improvement Proposal that introduced MirrorMaker 2
3. [Confluent Documentation - Multi-Datacenter Replication](https://docs.confluent.io/platform/current/multi-dc-deployments/replicator/index.html) - Comprehensive guide to replication patterns and best practices
4. [Kafka Connect Documentation](https://kafka.apache.org/documentation/#connect) - Framework documentation for understanding MM2's underlying architecture
5. [Apache Kafka Operations Guide](https://kafka.apache.org/documentation/#operations) - Operational best practices for monitoring and managing Kafka deployments
