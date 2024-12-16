import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

nango.triggerSync(args[1], args[2]).catch((err: unknown) => {
    console.log(err.response?.data || err.message);
});
