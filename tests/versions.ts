// Default versions are kept in sync by .github/workflows/update-docker-versions.yml
// To update, modify .env.example and the workflow will regenerate this file.
export const IMAGE_VERSIONS = {
    POSTGRES:      process.env['POSTGRES_VERSION']      || '16.14-alpine',
    REDIS:         process.env['REDIS_VERSION']         || '7.2-alpine',
    ELASTICSEARCH: process.env['ELASTICSEARCH_VERSION'] || '8.13.0',
    OPENSEARCH:    process.env['OPENSEARCH_VERSION']    || '2.13.0',
    ACTIVEMQ:      process.env['ACTIVEMQ_VERSION']      || '5.18.3',
    CLICKHOUSE:    process.env['CLICKHOUSE_VERSION']    || '26.2',
}
