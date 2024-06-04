import * as dotenv from 'dotenv';

if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
    dotenv.config({ path: '../../.env' });
}
