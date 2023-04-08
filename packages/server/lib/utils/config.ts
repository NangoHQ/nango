import * as dotenv from 'dotenv';

class Config {
    constructor() {
        if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
            dotenv.config({ path: '../../.env' });
        }
    }
}

export default new Config();
