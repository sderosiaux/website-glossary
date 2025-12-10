---
title: "Implementing Amundsen for Data Discovery"
description: "Set up Amundsen for data discovery. Learn metadata ingestion, streaming integration, search ranking, and best practices with code examples for data teams."
topics:
  - Amundsen
  - Data Discovery
  - Open Source
  - Table Metadata
  - Search Ranking
---

# Implementing Amundsen for Data Discovery

As data ecosystems grow in complexity, organizations face a critical challenge: how do teams discover, understand, and trust the data assets available to them? Amundsen, an open-source data discovery and metadata platform originally developed at Lyft, addresses this challenge by creating a searchable catalog of data resources with rich context about ownership, usage, and quality.

## Understanding Amundsen's Architecture

Amundsen's architecture consists of three main microservices that work together to provide a comprehensive data discovery experience:

**Frontend Service**: A React-based web application that provides the user interface for searching and browsing data assets. Users interact with this layer to discover tables, dashboards, and other data resources.

**Search Service**: Built on Elasticsearch or Apache Atlas, this service handles all search queries and ranking algorithms. It ensures that users find the most relevant data assets based on their queries and usage patterns.

**Metadata Service**: The core service that stores and serves metadata about data assets. It uses a graph database (typically Neo4j) to maintain relationships between tables, columns, owners, tags, and other entities.

This separation of concerns allows each component to scale independently and enables teams to customize specific aspects of the platform without affecting others.

## Setting Up Amundsen Locally

Getting started with Amundsen requires Docker and Docker Compose. The following setup demonstrates a local development environment:

```bash
# Clone the Amundsen repository
git clone https://github.com/amundsen-io/amundsen.git
cd amundsen

# Start all services using Docker Compose
docker-compose -f docker-amundsen.yml up
```

This command launches all three microservices along with their dependencies (Neo4j, Elasticsearch). Within minutes, you can access the Amundsen UI at `http://localhost:5000`.

For production deployments, you'll want to deploy each service separately with proper resource allocation:

```yaml
# Example Kubernetes deployment for metadata service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: amundsen-metadata
spec:
  replicas: 3
  selector:
    matchLabels:
      app: amundsen-metadata
  template:
    metadata:
      labels:
        app: amundsen-metadata
    spec:
      containers:
      - name: metadata-service
        image: amundsendev/amundsen-metadata:latest
        ports:
        - containerPort: 5002
        env:
        - name: PROXY_HOST
          value: "bolt://neo4j-service:7687"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

## Ingesting Metadata with Databuilder

The real power of Amundsen emerges when you connect it to your actual data sources. Amundsen's Databuilder library provides extractors for various data platforms:

```python
from pyhocon import ConfigFactory
from databuilder.extractor.postgres_metadata_extractor import PostgresMetadataExtractor
from databuilder.job.job import DefaultJob
from databuilder.loader.file_system_neo4j_csv_loader import FsNeo4jCSVLoader
from databuilder.publisher.neo4j_csv_publisher import Neo4jCsvPublisher
from databuilder.task.task import DefaultTask

# Configure extraction from PostgreSQL
job_config = ConfigFactory.from_dict({
    'extractor.postgres_metadata.{}'.format(PostgresMetadataExtractor.WHERE_CLAUSE_SUFFIX_KEY):
        "table_schema IN ('public', 'analytics')",
    'extractor.postgres_metadata.{}'.format(PostgresMetadataExtractor.USE_CATALOG_AS_CLUSTER_NAME):
        True,
    'extractor.postgres_metadata.extractor.sqlalchemy.{}'.format(
        PostgresMetadataExtractor.CONN_STRING):
        'postgresql://user:password@localhost:5432/production',
    'loader.filesystem_csv_neo4j.node_dir_path': '/tmp/amundsen/nodes',
    'loader.filesystem_csv_neo4j.relationship_dir_path': '/tmp/amundsen/relationships',
    'publisher.neo4j.node_files_directory': '/tmp/amundsen/nodes',
    'publisher.neo4j.relation_files_directory': '/tmp/amundsen/relationships',
    'publisher.neo4j.neo4j_endpoint': 'bolt://localhost:7687',
    'publisher.neo4j.neo4j_user': 'neo4j',
    'publisher.neo4j.neo4j_password': 'test',
})

job = DefaultJob(
    conf=job_config,
    task=DefaultTask(
        extractor=PostgresMetadataExtractor(),
        loader=FsNeo4jCSVLoader()
    ),
    publisher=Neo4jCsvPublisher()
)

job.launch()
```

This script extracts table and column metadata from PostgreSQL and publishes it to Amundsen's Neo4j backend. You can schedule this job to run periodically using Airflow or similar orchestration tools.

## Streaming Integration: Kafka and Real-Time Metadata

For organizations using streaming platforms, integrating Kafka metadata provides crucial visibility into real-time data pipelines. While Amundsen doesn't natively extract Kafka metadata, you can build custom extractors:

```python
from databuilder.extractor.base_extractor import Extractor
from confluent_kafka.admin import AdminClient
from databuilder.models.table_metadata import TableMetadata, ColumnMetadata

class KafkaMetadataExtractor(Extractor):
    def init(self, conf):
        self.conf = conf
        self.admin_client = AdminClient({
            'bootstrap.servers': conf.get('kafka_bootstrap_servers')
        })

    def extract(self):
        topics = self.admin_client.list_topics(timeout=10).topics

        for topic_name, topic_metadata in topics.items():
            # Extract schema from Schema Registry if available
            schema = self._get_schema_from_registry(topic_name)

            columns = []
            if schema:
                for field in schema.get('fields', []):
                    columns.append(ColumnMetadata(
                        name=field['name'],
                        description=field.get('doc', ''),
                        col_type=field['type']
                    ))

            yield TableMetadata(
                database='kafka',
                cluster='production',
                schema='topics',
                name=topic_name,
                description=f'Kafka topic with {topic_metadata.partitions} partitions',
                columns=columns
            )
```

When working with Kafka and streaming platforms, operational monitoring tools complement Amundsen perfectly. Real-time monitoring platforms provide topic management and data exploration for Kafka clusters, while Amundsen serves as the centralized metadata catalog. You can reference monitoring tool URLs in Amundsen's table descriptions, creating links between operational monitoring and data discovery.

## Enhancing Search Ranking

Amundsen's search ranking considers multiple signals to surface the most relevant results. You can improve discoverability by:

**Usage-based ranking**: Amundsen tracks table queries and views. Frequently accessed tables rank higher in search results.

**Quality metrics**: Integrate data quality scores from tools like Great Expectations or custom validation frameworks.

**Programmatic descriptions**: Enrich metadata with automated descriptions generated from column statistics and data profiling.

```python
from databuilder.models.table_metadata import TableMetadata

table = TableMetadata(
    database='warehouse',
    cluster='production',
    schema='analytics',
    name='user_events',
    description='Tracks all user interaction events across web and mobile platforms',
    tags=['pii', 'gdpr', 'high-traffic']
)

# Add programmatic metadata
table.set_programmatic_description({
    'row_count': 15000000,
    'size_bytes': 8589934592,
    'last_updated': '2025-12-07',
    'quality_score': 0.95
})
```

## Best Practices for Production

**Automate metadata ingestion**: Schedule regular extraction jobs to keep metadata fresh. Stale metadata erodes user trust.

**Establish ownership**: Assign clear owners to data assets. Amundsen's ownership features enable accountability and provide contact points for questions.

**Curate descriptions**: Automated metadata extraction provides structure, but human-written descriptions add essential context about business logic and use cases.

**Monitor adoption**: Track search queries, page views, and user feedback to understand how teams discover data and where gaps exist.

**Integrate with data lineage**: Connect Amundsen with lineage tools to show upstream and downstream dependencies, helping users understand data provenance.

## Conclusion

Implementing Amundsen transforms data discovery from tribal knowledge into a scalable, self-service capability. By centralizing metadata from databases, warehouses, streaming platforms, and BI tools, data teams can spend less time hunting for data and more time deriving insights. Whether you're managing traditional batch workflows or real-time streaming pipelines, Amundsen provides the foundational layer for data democratization and governance.

Start small with a pilot project, demonstrate value through improved discovery times, and expand coverage as adoption grows. The investment in proper metadata management pays dividends in reduced onboarding time, better data quality, and increased trust in your data ecosystem.

## Sources

- [Amundsen Official Documentation](https://www.amundsen.io/amundsen/)
- [Amundsen GitHub Repository](https://github.com/amundsen-io/amundsen)
- [Databuilder ETL Framework](https://github.com/amundsen-io/amundsen/tree/main/databuilder)
- [Lyft's Amundsen: Data Discovery & Metadata Engine](https://eng.lyft.com/amundsen-lyfts-data-discovery-metadata-engine-62d27254fbb9)
