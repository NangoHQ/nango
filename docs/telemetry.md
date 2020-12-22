Pizzly's Dashboard collects telemetry data to help us understand usage of Pizzly and how to improve it. For example, this data help us understand which part of the dashboard is used and which APIs are mostly used.

## How does the Telemetry work?

Pizzly's Dashboard uses a minimal JavaScript snippet that retrieves a 1x1 invisible pixel image. The snippet looks like this:

```js
const uuid = '<%= process.env.UUID %>' || ''

if (uuid) {
  const url = window.location.href.replace(/-([a-z0-9]{4}-){3}[a-z0-9]{12}/g, '-******')
  const nocache = Math.random() * 2e10
  const baseURL = 'https://telemetry.bearer.sh/collect'
  const src = baseURL + '?uuid=' + uuid + '&url=' + encodeURIComponent(url) + '&z=' + nocache

  const img = document.createElement('img')
  img.src = src

  console.log('Telemetry collected. Learn more at https://github.com/Bearer/Pizzly/blob/master/docs/telemetry.md')
}
```

## What data is collected?

Data is collected only from the dashboard:

- The unique project ID (generated with UUID) automatically generated and saved within your `package.json`
- The full URL (`window.location.href`) of the current web page

Other services, such as the proxy or the API do not collect Telemetry data.

## How to opt-out?

While we appreciate the insights this data provides, we also know that not everyone wants to share usage data. To disable the telemetry, edit the file `.envrc` as follow:

```bash
export TELEMETRY=FALSE
```
