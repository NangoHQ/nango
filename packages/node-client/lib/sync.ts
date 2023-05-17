import type { Nango } from './index.js';

export abstract class NangoSync {
    abstract fetchData(nango: Nango): Promise<any>;
    abstract postData(nango: Nango): Promise<any>;
    abstract patchData(nango: Nango): Promise<any>;
    abstract putData(nango: Nango): Promise<any>;
    abstract deleteData(nango: Nango): Promise<any>;
}

export default NangoSync;
