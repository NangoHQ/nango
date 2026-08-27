export const sql = [
    `
    CREATE VIEW IF NOT EXISTS {database:Identifier}.daily_billable_data_transfer AS
    SELECT
        day,
        account_id,
        environment_id,
        integration_id,
        connection_id,
        concat(package, '.', callsite) AS source,
        egressed_bytes
    FROM daily_data_transfer
    WHERE (package, callsite) IN (
        ('server', 'get_/records'),
        ('server', 'get_/proxy'),
        ('server', 'proxy'),
        ('server', 'post_/proxy'),
        ('server', 'patch_/proxy'),
        ('server', 'put_/proxy'),
        ('server', 'delete_/proxy'),
        ('server', 'unknown_/proxy'),
        ('server', 'webhook_forward'),
        ('runner', 'proxy'),
        ('runner', 'uncontrolled_fetch'),
        ('runner', 'persist_customer_logs'),
        ('runner', 'persist_records')
    )
    `
];
