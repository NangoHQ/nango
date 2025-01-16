import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import http from 'node:http';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import https from 'node:https';

const options: https.AgentOptions = {
    keepAlive: true, // default to false for some reason
    timeout: 60000,
    maxFreeSockets: 2000,
    scheduling: 'fifo', // optimize for open sockets and better for high throughput
    family: 4 // Using IPV4 can reduce error network and reduce latency https://github.com/nodejs/node/issues/5436#issuecomment-189474356
};

export let httpAgent: HttpProxyAgent<string> | HttpAgent = new http.Agent(options);
export let httpsAgent: HttpsProxyAgent<string> | HttpsAgent = new https.Agent(options);

const hasHttpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'];
const hasHttpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY'];

if (hasHttpProxy) {
    httpAgent = new HttpProxyAgent(hasHttpProxy);
}
if (hasHttpsProxy) {
    httpsAgent = new HttpsProxyAgent(hasHttpsProxy);
}

const config: AxiosRequestConfig = {
    httpAgent: httpAgent,
    httpsAgent: httpsAgent
};

if (hasHttpProxy || hasHttpsProxy) {
    config.proxy = false;
}

export const axiosInstance = axios.create(config);
