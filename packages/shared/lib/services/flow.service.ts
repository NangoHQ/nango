import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';

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
}

export default new FlowService();
