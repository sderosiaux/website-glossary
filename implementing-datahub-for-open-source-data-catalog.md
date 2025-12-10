---
title: "Implementing DataHub for Open Source Data Catalog"
description: "Implement DataHub as your open source data catalog solution. Learn streaming ingestion, metadata management, and lineage tracking for modern platforms."
topics:
  - DataHub
  - Data Catalog
  - Open Source
  - Metadata Ingestion
  - Lineage Graph
---

# Implementing DataHub for Open Source Data Catalog

Organizations need robust data catalog solutions to maintain visibility into their data assets. DataHub, LinkedIn's open-source metadata platform, has emerged as a leading data catalog choice.

## Why DataHub?

DataHub distinguishes itself from proprietary solutions through its architecture and real-time capabilities. Unlike traditional data catalogs that rely on batch-based metadata collection, DataHub supports streaming metadata ingestion through Kafka, enabling near real-time updates to your data catalog. This is particularly valuable in fast-moving data environments where understanding the current state of data assets is critical.

The platform provides comprehensive lineage tracking, data discovery, governance capabilities, and a rich API ecosystem that makes it ideal for integration into existing data platforms.

## Core Architecture

DataHub's architecture consists of several key components:

**Metadata Service (GMS)**: The backend service that handles metadata storage and retrieval. It exposes REST and GraphQL APIs for all metadata operations.

**Frontend (datahub-frontend)**: A React-based web application providing the user interface for data discovery and exploration.

**Metadata Store**: Typically MySQL, PostgreSQL, or MariaDB for primary metadata storage, with Elasticsearch for search indexing.

**Message Broker**: Kafka acts as the streaming backbone, enabling real-time metadata change events and asynchronous processing.

This event-driven architecture allows DataHub to process metadata updates as they happen, rather than waiting for scheduled batch jobs. When a table schema changes or a pipeline completes, that information can flow into DataHub immediately.

## Getting Started with Docker Compose

For development and proof-of-concept deployments, Docker Compose provides the fastest path to a working DataHub instance:

```bash
# Clone the DataHub repository
git clone https://github.com/datahub-project/datahub.git
cd datahub

# Launch all services using quickstart
./docker/quickstart.sh
```

This script pulls and starts all necessary containers: MySQL, Elasticsearch, Kafka (including Zookeeper), Schema Registry, the metadata service, and the frontend. After a few minutes, you can access the DataHub UI at `http://localhost:9002`.

The default setup includes sample data to help you explore DataHub's features. You'll find example datasets, dashboards, and lineage graphs that demonstrate the platform's capabilities.

## Metadata Ingestion Patterns

DataHub supports multiple ingestion approaches, each suited to different use cases:

### Pull-Based Ingestion

The most common pattern uses DataHub's ingestion framework to pull metadata from source systems on a schedule:

```yaml
# recipe.yml - Postgres ingestion example
source:
  type: postgres
  config:
    host_port: "postgres:5432"
    database: "analytics"
    username: "datahub"
    password: "${POSTGRES_PASSWORD}"
    schema_pattern:
      allow: ["public", "staging"]
      deny: ["temp_.*"]
    profiling:
      enabled: true
      profile_table_level_only: false

sink:
  type: datahub-rest
  config:
    server: "http://datahub-gms:8080"
```

Execute the ingestion:

```bash
datahub ingest -c recipe.yml
```

This approach works well for batch-oriented sources like data warehouses, databases, and BI tools. DataHub provides pre-built connectors for dozens of platforms including Snowflake, BigQuery, Redshift, dbt, Airflow, and Tableau.

### Push-Based Streaming Integration

For real-time use cases, DataHub's Kafka integration enables push-based metadata updates. This is particularly relevant when working with streaming platforms like those managed by Conduktor.

When your streaming applications produce or consume data, they can emit metadata events directly to DataHub's Kafka topics:

```python
# Python example using DataHub's Kafka emitter
from datahub.emitter.kafka_emitter import DatahubKafkaEmitter
from datahub.metadata.schema_classes import DatasetPropertiesClass

emitter = DatahubKafkaEmitter(
    connection=KafkaProducerConnectionConfig(
        bootstrap="kafka:9092",
        schema_registry_url="http://schema-registry:8081"
    )
)

# Emit dataset metadata
dataset_properties = DatasetPropertiesClass(
    description="Real-time user events stream",
    customProperties={
        "retention.ms": "604800000",
        "partition.count": "12"
    }
)

emitter.emit_mcp(
    entity_urn="urn:li:dataset:(urn:li:dataPlatform:kafka,user.events,PROD)",
    aspect=dataset_properties
)
```

This pattern ensures that your data catalog stays synchronized with your actual streaming infrastructure. As Kafka topics are created, schemas evolve, or retention policies change, those updates flow into DataHub automatically.

## Lineage Tracking

One of DataHub's most powerful features is automatic lineage graph construction. Lineage shows how data flows through your systems - from source tables through transformation pipelines to final dashboards.

For streaming pipelines, you can programmatically declare lineage:

```python
from datahub.metadata.schema_classes import UpstreamLineageClass, UpstreamClass

# Define that 'processed_events' is derived from 'raw_events'
upstream = UpstreamLineageClass(
    upstreams=[
        UpstreamClass(
            dataset="urn:li:dataset:(urn:li:dataPlatform:kafka,raw.events,PROD)",
            type="TRANSFORMED"
        )
    ]
)

emitter.emit_mcp(
    entity_urn="urn:li:dataset:(urn:li:dataPlatform:kafka,processed.events,PROD)",
    aspect=upstream
)
```

When integrated with orchestration tools like Airflow (via the Airflow lineage backend), DataHub automatically captures and visualizes your entire data pipeline topology.

## Production Considerations

Moving DataHub to production requires attention to several areas:

**Scaling**: The metadata service and Elasticsearch are your primary scaling targets. Plan for horizontal scaling of GMS instances behind a load balancer, and appropriately size your Elasticsearch cluster based on metadata volume.

**Authentication**: Enable SSO integration using OIDC or SAML. DataHub supports integration with Okta, Azure AD, and other identity providers.

**Monitoring**: Instrument DataHub's metrics endpoints with Prometheus and set up alerts for ingestion failures, search performance degradation, and Kafka consumer lag.

**Backup**: Implement regular backups of your metadata database. Unlike source data systems, metadata is often harder to reconstruct if lost.

## Integration with Kafka Management Tools

DataHub provides complementary capabilities to operational Kafka management platforms. Governance platforms excel at operational Kafka management - monitoring, testing, and troubleshooting - while DataHub focuses on metadata, discovery, and governance.

You can configure DataHub to ingest metadata from Kafka clusters, creating a unified view that combines operational metrics with schema information, lineage, and ownership data.

## Conclusion

DataHub represents a mature, production-ready approach to open source data cataloging. Its streaming-first architecture, extensive connector ecosystem, and powerful lineage capabilities make it particularly well-suited for modern data platforms built on event-driven architectures.

For data engineers and platform engineers, implementing DataHub means gaining visibility into the full scope of your data landscape - from raw Kafka topics to transformed warehouse tables to final analytics dashboards. The initial investment in setup and integration pays dividends in improved data discovery, reduced duplicate work, and better data governance.

Start with the Docker Compose quickstart to explore DataHub's features, then progressively integrate it with your existing systems through the ingestion framework and streaming APIs. As your data platform evolves, DataHub can evolve with it, serving as the central nervous system for your organization's data ecosystem.

## Sources

- [DataHub Official Documentation](https://datahubproject.io/docs/)
- [DataHub GitHub Repository](https://github.com/datahub-project/datahub)
- [DataHub Metadata Ingestion](https://datahubproject.io/docs/metadata-ingestion/)
- [LinkedIn Engineering: DataHub](https://engineering.linkedin.com/blog/2019/data-hub)
