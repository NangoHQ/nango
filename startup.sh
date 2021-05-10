#!/bin/sh

# Docker Startup script

# Apply migration
./node_modules/.bin/knex --cwd ./src/lib/database/config migrate:latest

# Start App
node ./src/index.js