import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';

class FlowService {
    public getAllAvailableFlows() {
        try {
            const flowPath = path.join(dirname(), '../../../flows.yaml');
            const flows = yaml.load(fs.readFileSync(flowPath).toString());

            return flows;
        } catch (_e) {
            return {};
        }
    }

    public async getAddedPublicFlows(environmentId: number) {
        return getPublicConfig(environmentId);
    }
}

export default new FlowService();
