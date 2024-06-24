import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';
import http from 'node:http';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import https from 'node:https';

export let httpAgent: HttpProxyAgent<string> | HttpAgent = new http.Agent();
export let httpsAgent: HttpsProxyAgent<string> | HttpsAgent = new https.Agent();

const hasHttpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'];
const hasHttpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY'];

if (hasHttpProxy) {
    httpAgent = new HttpProxyAgent(hasHttpProxy);
}
if (hasHttpsProxy) {
    httpsAgent = new HttpsProxyAgent(hasHttpsProxy);
}

export const axiosInstance = axios.create({
    proxy: false,
    httpAgent: httpAgent,
    httpsAgent: httpsAgent
});
