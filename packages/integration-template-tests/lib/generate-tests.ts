import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fullPath = process.cwd();
const configPath = path.resolve(fullPath, './nango-integrations/nango.yaml');
const config: any = yaml.load(fs.readFileSync(configPath, 'utf8'));
const { integrations } = config;

for (const integration in integrations) {
    const { syncs } = integrations[integration];
    for (const syncName in syncs) {
        const sync = syncs[syncName];
        generateSyncTest(integration, syncName, sync.output);
    }
}

function generateSyncTest(integration: string, syncName: string, modelName: string) {
    const data: {
        integration: string;
        syncName: string;
        modelName: string;
        paginate: Record<string, boolean>;
        [key: string]: any;
    } = {
        integration,
        syncName,
        modelName,
        paginate: {}
    };

    const basePath = path.resolve(__dirname, `../nango-integrations/${integration}/mocks`);

    if (fs.existsSync(path.join(basePath, `${syncName}/batchDelete.json`))) {
        data['batchDelete'] = 'batchDelete';
    }

    if (fs.existsSync(path.join(basePath, `${syncName}/batchSave.json`))) {
        data['batchSave'] = 'batchSave';
    }

    const paginateMethods = ['get', 'post', 'delete', 'put', 'patch'];
    data['paginate'] = {};

    paginateMethods.forEach((method) => {
        if (fs.existsSync(path.join(basePath, `paginate/${method}/${syncName}`))) {
            data['paginate'][method] = true;
        }
    });

    if (fs.existsSync(path.join(basePath, 'nango/getConnection.json'))) {
        data['nango'] = { getConnection: 'getConnection' };
    }

    console.log(`Data: ${JSON.stringify(data, null, 2)}`);

    const templatePath = path.resolve(__dirname, 'sync-template.ejs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');

    const result = ejs.render(templateSource, data);

    if (!fs.existsSync(path.resolve(__dirname, '../nango-integrations/tests'))) {
        fs.mkdirSync(path.resolve(__dirname, '../nango-integrations/tests'), { recursive: true });
    }
    const outputPath = path.resolve(__dirname, `../nango-integrations/tests/${data['integration']}-${data['syncName']}.test.ts`);
    fs.writeFileSync(outputPath, result);

    console.log(`Test file 'tests/${data['integration']}-${data['syncName']}.test.ts' created successfully.`);
}
