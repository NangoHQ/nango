// tests with CJS syntax
const { Nango } = require('../dist/index.cjs');

const nango = new Nango({ secretKey: 'test' });
console.log(nango.userAgent);
console.log('✅ Done');
