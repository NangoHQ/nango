import { log, add } from './helper';

export default async function fetchData(nango: any) {
    log('fetching data...');
    add(1);
    return await nango.post();
}
