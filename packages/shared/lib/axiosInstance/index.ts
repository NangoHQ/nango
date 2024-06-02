import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

export let proxyAgent: HttpProxyAgent<string> | HttpsProxyAgent<string> | undefined = undefined;

const httpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'] || '';
const httpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY'] || '';

proxyAgent = (!!httpProxy && new HttpProxyAgent(httpProxy)) || undefined;
proxyAgent = (!!httpsProxy && new HttpsProxyAgent(httpProxy)) || undefined;

export const axiosInstance = axios.create({
    httpAgent: proxyAgent,
    httpsAgent: proxyAgent
});
