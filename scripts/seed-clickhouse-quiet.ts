// Preloaded by `npm run seed:clickhouse` after dotenv — runs before the main module
// imports workspace packages (which initialize loggers).
if (!process.argv.includes('--verbose')) {
    process.env['LOG_LEVEL'] = 'warn';
}
