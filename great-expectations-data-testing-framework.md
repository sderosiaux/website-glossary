---
title: "Great Expectations: Data Testing Framework"
description: "Implement robust data quality testing with Great Expectations framework. Learn batch and streaming validation patterns for testing data in modern pipelines."
topics:
  - Great Expectations
  - Data Testing
  - Expectations
  - Validation Suite
  - Data Quality
---

# Great Expectations: Data Testing Framework

Data quality is the foundation of reliable analytics and machine learning. Yet, many data teams discover data issues only after they've impacted downstream systems or business decisions. Great Expectations (GX) addresses this challenge by providing a Python-based framework for testing, documenting, and profiling your data pipelines.

## What is Great Expectations?

Great Expectations is an open-source data validation framework that enables data teams to express what they "expect" from their data through assertions called Expectations. Think of it as unit testing for your data—instead of testing code behavior, you're testing data quality, schema compliance, and business logic.

The framework goes beyond simple validation by generating data documentation, maintaining data quality metrics over time, and integrating seamlessly into modern data workflows.

## Core Concepts

### Expectations

Expectations are declarative assertions about your data. They're the building blocks of data quality tests. Great Expectations provides over 300 built-in Expectations covering common validation scenarios:

```python
import great_expectations as gx

# Initialize a Data Context
context = gx.get_context()

# Create a validator for your data
validator = context.sources.pandas_default.read_csv(
    "customer_data.csv"
)

# Define expectations
validator.expect_table_row_count_to_be_between(min_value=1000, max_value=1000000)
validator.expect_column_values_to_not_be_null("customer_id")
validator.expect_column_values_to_be_unique("customer_id")
validator.expect_column_values_to_be_in_set("status", ["active", "inactive", "pending"])
validator.expect_column_mean_to_be_between("order_amount", min_value=0, max_value=10000)
```

### Expectation Suites

Expectation Suites group related Expectations together, creating a comprehensive test suite for a dataset. You can create suites manually or use GX's profiling capabilities to auto-generate them:

```python
# Create an Expectation Suite
suite = context.add_expectation_suite(
    expectation_suite_name="customer_validation_suite"
)

# Or auto-generate from existing data
from great_expectations.profile.user_configurable_profiler import UserConfigurableProfiler

profiler = UserConfigurableProfiler(
    profile_dataset=validator,
    excluded_expectations=["expect_column_quantile_values_to_be_between"],
)

suite = profiler.build_suite()
```

### Checkpoints

Checkpoints orchestrate the validation process. They define which data to validate, which Expectation Suite to apply, and what actions to take when validations pass or fail:

```python
checkpoint_config = {
    "name": "customer_checkpoint",
    "validations": [
        {
            "batch_request": {
                "datasource_name": "customer_datasource",
                "data_connector_name": "default_runtime_data_connector",
                "data_asset_name": "customer_data",
            },
            "expectation_suite_name": "customer_validation_suite",
        }
    ],
    "action_list": [
        {
            "name": "store_validation_result",
            "action": {"class_name": "StoreValidationResultAction"},
        },
        {
            "name": "update_data_docs",
            "action": {"class_name": "UpdateDataDocsAction"},
        },
    ],
}

checkpoint = context.add_checkpoint(**checkpoint_config)
```

## Batch Data Validation

For traditional batch processing pipelines, Great Expectations integrates with data warehouses, lakes, and processing frameworks:

```python
# SQL Database validation
import pandas as pd
from sqlalchemy import create_engine

engine = create_engine("postgresql://user:password@localhost/database")

# Create a SQL datasource
datasource_config = {
    "name": "postgres_datasource",
    "class_name": "Datasource",
    "execution_engine": {
        "class_name": "SqlAlchemyExecutionEngine",
        "connection_string": "postgresql://user:password@localhost/database",
    },
    "data_connectors": {
        "default_runtime_data_connector": {
            "class_name": "RuntimeDataConnector",
            "batch_identifiers": ["default_identifier_name"],
        },
    },
}

context.add_datasource(**datasource_config)

# Validate a table
batch_request = {
    "datasource_name": "postgres_datasource",
    "data_connector_name": "default_runtime_data_connector",
    "data_asset_name": "orders",
}

result = checkpoint.run(batch_request=batch_request)
```

## Streaming Data Validation

Modern data architectures increasingly rely on streaming data. Great Expectations can validate streaming data by integrating with Apache Kafka, Kinesis, or other streaming platforms.

### Kafka Integration

Here's how to validate streaming data from Kafka:

```python
from kafka import KafkaConsumer
import json
import great_expectations as gx

# Initialize GX context
context = gx.get_context()

# Kafka consumer setup
consumer = KafkaConsumer(
    'customer-events',
    bootstrap_servers=['localhost:9092'],
    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
    auto_offset_reset='latest',
    enable_auto_commit=True,
)

# Streaming validation function
def validate_streaming_batch(messages, suite_name):
    """Validate a micro-batch of streaming messages"""
    df = pd.DataFrame(messages)

    validator = context.sources.pandas_default.read_dataframe(df)

    # Run validation
    results = validator.validate(
        expectation_suite_name=suite_name,
        catch_exceptions=True
    )

    if not results["success"]:
        # Handle validation failures
        handle_data_quality_issues(results)

    return results

# Process streaming data in micro-batches
batch_size = 100
message_buffer = []

for message in consumer:
    message_buffer.append(message.value)

    if len(message_buffer) >= batch_size:
        validation_results = validate_streaming_batch(
            message_buffer,
            "streaming_customer_events_suite"
        )

        # Clear buffer after validation
        message_buffer = []
```

## Custom Expectations

For domain-specific validation logic, you can create custom Expectations:

```python
from great_expectations.expectations.expectation import ColumnMapExpectation

class ExpectColumnValuesToBeValidEmail(ColumnMapExpectation):
    """Expect column values to be valid email addresses"""

    map_metric = "column_values.match_regex"
    success_keys = ("mostly", "regex")

    default_kwarg_values = {
        "regex": r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
        "mostly": 1.0,
    }
```

## Best Practices

1. **Start Simple**: Begin with basic Expectations like null checks and uniqueness constraints before adding complex validations.

2. **Version Control**: Store Expectation Suites in version control alongside your data pipeline code.

3. **Incremental Adoption**: Implement GX incrementally, starting with critical datasets.

4. **Monitor Trends**: Use GX's data documentation to track data quality metrics over time.

5. **Fail Fast**: Configure Checkpoints to halt pipelines on critical validation failures.

6. **Balance Coverage and Performance**: In streaming scenarios, validate representative samples rather than every record to maintain throughput.

## Conclusion

Great Expectations transforms data quality from a reactive debugging exercise into a proactive testing discipline. By defining Expectations, creating validation suites, and integrating checks into batch and streaming pipelines, data teams can catch issues early, build trust in their data, and reduce time spent firefighting data quality incidents.

Whether you're validating nightly batch loads in Snowflake or real-time events streaming through Kafka, Great Expectations provides the framework to ensure your data meets the standards your business depends on.

Start small, iterate quickly, and build confidence in your data—one Expectation at a time.

## Sources

- [Great Expectations Official Documentation](https://docs.greatexpectations.io/)
- [Great Expectations GitHub Repository](https://github.com/great-expectations/great_expectations)
- [Great Expectations Core Concepts](https://docs.greatexpectations.io/docs/terms/expectation)
- [Data Quality Testing with Great Expectations](https://greatexpectations.io/blog/)
