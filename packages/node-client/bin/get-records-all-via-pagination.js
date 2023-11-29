import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);
const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

const paginate = async (nango, args, cursor) => {
    const params = {
        providerConfigKey: args[1],
        connectionId: args[2],
        model: args[3],
        limit: 100
    };

    if (cursor) {
        params.cursor = cursor;
    }
    const response = await nango.listRecords(params);
    console.log(response);
    if (response.next_cursor) {
        await paginate(nango, args, response.next_cursor);
    }
};

paginate(nango, args);
