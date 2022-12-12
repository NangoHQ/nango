import * as dotenv from 'dotenv';
if (process.env['PIZZLY_SERVER_RUN_MODE'] !== 'DOCKERIZED') {
    dotenv.config({ path: '../../.env' });
}
