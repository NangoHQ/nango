// tests with ESM syntax
import { Nango } from '../dist/index.cjs';

const nango = new Nango({ secretKey: 'test' });
console.log(nango.userAgent);
console.log('✅ Done');
