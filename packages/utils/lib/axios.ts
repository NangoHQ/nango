import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import http from 'node:http';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import https from 'node:https';

let agentOptions: http.AgentOptions = {
    keepAlive: true,
    timeout: 30000,
    scheduling: 'fifo'
};

// Set this env var to fine tune the agent depending on the service
// It's helpful not to hardcode it because our service have different call pattern
// And allows OSS users to change this too
if (process.env['HTTP_AGENT_CONFIG']) {
    try {
        agentOptions = JSON.parse(process.env['HTTP_AGENT_CONFIG']) as http.AgentOptions;
        console.warn('HTTP_AGENT_CONFIG', agentOptions);
    } catch (err) {
        console.error('invalid HTTP_AGENT configuration', err);
    }
}

export let httpAgent: HttpProxyAgent<string> | HttpAgent = new http.Agent(agentOptions);
export let httpsAgent: HttpsProxyAgent<string> | HttpsAgent = new https.Agent(agentOptions);

function agentToJson(this: unknown): string {
    if (this instanceof http.Agent) {
        return '[httpAgent]';
    } else if (this instanceof https.Agent) {
        return '[httpsAgent]';
    } else {
        return '[unknownAgent]';
    }
}

// we set toJSON because we've seen major issues with serializing agents when
// they're full of data. This shortcuts that issue by just returning a string
(httpAgent as any).toJSON = agentToJson;
(httpsAgent as any).toJSON = agentToJson;

const hasHttpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'];
const hasHttpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY'];

if (hasHttpProxy) {
    httpAgent = new HttpProxyAgent(hasHttpProxy, agentOptions);
}
if (hasHttpsProxy) {
    httpsAgent = new HttpsProxyAgent(hasHttpsProxy, agentOptions);
}

const config: AxiosRequestConfig = {
    httpAgent: httpAgent,
    httpsAgent: httpsAgent
};

if (hasHttpProxy || hasHttpsProxy) {
    config.proxy = false;
}

export const axiosInstance = axios.create(config);
