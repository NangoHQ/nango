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
    const data: Record<string, string | Record<string, string | boolean>> = {
        integration,
        syncName,
        modelName
    };

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/${syncName}/batchDelete.json`))) {
        data['batchDelete'] = 'batchDelete';
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/${syncName}/batchSave.json`))) {
        data['batchSave'] = 'batchSave';
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/paginate/get/${syncName}`))) {
        data['paginate'] = {};
        data['paginate']['get'] = true;
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/paginate/post/${syncName}`))) {
        data['paginate'] = {};
        data['paginate']['post'] = true;
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/paginate/delete/${syncName}`))) {
        data['paginate'] = {};
        data['paginate']['delete'] = true;
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/paginate/put/${syncName}`))) {
        data['paginate'] = {};
        data['paginate']['put'] = true;
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/paginate/patch/${syncName}`))) {
        data['paginate'] = {};
        data['paginate']['patch'] = true;
    }

    if (fs.existsSync(path.resolve(__dirname, `../nango-integrations/${integration}/mocks/nango/getConnection.json`))) {
        data['nango'] = {};
        data['nango']['getConnection'] = 'getConnection';
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
