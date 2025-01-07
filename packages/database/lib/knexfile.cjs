// Knex CLI for migration needs this Knexfile but doesn't play well with ESM modules.
// That's why the content of the Knex config is moved to ./config.ts to be imported by the app in ESM-fashion, and the Knexfile is only used for the Knex CLI in CommonJS-fashion.
const { config } = require('../dist/config.js');

module.exports = config;
