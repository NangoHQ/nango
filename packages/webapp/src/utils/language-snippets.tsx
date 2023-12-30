export const nodeSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string) => {
        return `import Nango from '@nangohq/node';
const nango = new Nango({ secretKey: '${secretKey}' });

const issues = await nango.listRecords({
    proivderConfigKey: '${providerConfigKey}',
    connectionId: '${connectionId}',
    endpoint: '${endpoint}'
});

console.log(issues);
`};

export const nodeActionSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string, input?: Record<string, any>) => {
        return `import Nango from '@nangohq/node';
const nango = new Nango({ secretKey: '${secretKey}' });

const issues = await nango.triggerAction({
    proivderConfigKey: '${providerConfigKey}',
    connectionId: '${connectionId}',
    endpoint: '${endpoint}'${input ? ',\n    ' : ''}${input ? `input: {\n${JSON.stringify(input, null, 2).split('\n').slice(1).join('\n').replace(/^/gm, '    ')}}` : ''}
});

console.log(issues);
`};

export const curlSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string, method = 'GET') => {
        return `
    curl --request ${method} \\
    --url https://api.nango.dev/v1${endpoint} \\
    --header 'Authorization: Bearer ${secretKey}' \\
    --header 'Connection-Id: ${connectionId}' \\
    --header 'Provider-Config-Key: ${providerConfigKey}'
        `;
    };

export const pythonSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string) => {
        return`
        import requests

url = "https://api.nango.dev/v1${endpoint}"

headers = {
    "Authorization": "Bearer ${secretKey}",
    "Connection-Id": "${connectionId}",
    "Provider-Config-Key": "${providerConfigKey}",
}

response = requests.request("GET", url, headers=headers)

print(response.text)
        `
};

export const phpSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string) => {
        return`
<?php

$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => "https://api.nango.dev/v1${endpoint}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => "",
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => "GET",
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${secretKey}",
    "Connection-Id: ${connectionId}",
    "Provider-Config-Key: ${providerConfigKey}",
  ],
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}`
};

export const goSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string) => {
        return`
package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
)

func main() {

	url := "https://api.nango.dev/v1${endpoint}"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer ${secretKey}")
	req.Header.Add("Connection-Id", "${connectionId}")
	req.Header.Add("Provider-Config-Key", "${providerConfigKey}")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := ioutil.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))
}`
};

export const javaSnippet = (endpoint: string, secretKey: string, connectionId: string, providerConfigKey: string) => {
        return`
HttpResponse<String> response = Unirest.get("https://api.nango.dev/v1${endpoint}")
  .header("Authorization", "Bearer ${secretKey}")
  .header("Connection-Id", "${connectionId}")
  .header("Provider-Config-Key", "${providerConfigKey}")
  .asString();`
};

export const autoStartSnippet = (secretKey: string, provider: string, sync: string) => {
        return `import Nango from '@nangohq/node';

const nango = new Nango({ secretKey: '${secretKey}' });

await nango.startSync('${provider}', ['${sync}'], '<CONNECTION-ID>');
`};

export const setMetadaSnippet = (secretKey: string, provider: string, input: Record<string, any>) => {
        return `import Nango from '@nangohq/node';

const nango = new Nango({ secretKey: '${secretKey}' });

await nango.setMetadata(
    '${provider}',
    '<CONNECTION-ID>',
    ${input ? `{\n${JSON.stringify(input, null, 2).split('\n').slice(1).join('\n').replace(/^/gm, '    ')}` : ''}
);
`};
