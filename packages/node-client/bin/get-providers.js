import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

try {
  const res = await nango.listProviders()
  console.log(res);
} catch (err) {
  console.log(err?.response?.data || err.message);
}
