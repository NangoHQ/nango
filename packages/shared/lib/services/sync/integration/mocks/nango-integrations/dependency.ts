import { createHash } from 'crypto';

export default async function fetchData(nango: any) {
    const id = createHash('md5').update('get').digest('hex');
    console.log(id);

    return await nango.get();
}
