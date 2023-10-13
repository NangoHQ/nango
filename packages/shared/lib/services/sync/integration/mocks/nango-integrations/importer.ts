import { log, add } from './helper';
import * as helper from './helper';

export default async function fetchData(nango: any) {
    helper.log('fetching data...');
    log('fetching data...');
    add(1);
    return await nango.post();
}
