import type winston from 'winston';
import { fileURLToPath } from 'url';
import path from 'path';

export function dirname() {
    return path.dirname(fileURLToPath(import.meta.url));
}

export function getPort() {
    return process.env['SERVER_PORT'] != null ? +process.env['SERVER_PORT'] : 3003;
}

export function getHost() {
    return process.env['SERVER_HOST'] || 'http://localhost';
}

export function getBaseUrl() {
    return getHost() + `:${getPort()}`;
}

export function getOauthCallbackUrl() {
    return process.env['AUTH_CALLBACK_URL'] || getBaseUrl() + '/oauth/callback';
}

/**
 * A helper function to interpolate a string.
 * interpolateString('Hello ${name} of ${age} years", {name: 'Tester', age: 234}) -> returns 'Hello Tester of age 234 years'
 *
 * @remarks
 * Copied from https://stackoverflow.com/a/1408373/250880
 */
export function interpolateString(str: string, replacers: Record<string, any>) {
    return str.replace(/\${([^{}]*)}/g, (a, b) => {
        var r = replacers[b];
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a; // Typecast needed to make TypeScript happy
    });
}

/**
 * A helper function to check if replacers contains all necessary params to interpolate string.
 * interpolateString('Hello ${name} of ${age} years", {name: 'Tester'}) -> returns false
 */
export function missesInterpolationParam(str: string, replacers: Record<string, any>) {
    let interpolatedStr = interpolateString(str, replacers);
    return /\${([^{}]*)}/g.test(interpolatedStr);
}

/**
 * A helper function to extract the additional connection configuration options from the frontend Auth request.
 */
export function getConnectionConfig(queryParams: any): Record<string, string> {
    var arr = Object.entries(queryParams);
    arr = arr.filter(([_, v]) => typeof v === 'string'); // Filter strings
    arr = arr.map(([k, v]) => [`connectionConfig.params.${k}`, v]); // Format keys to 'connectionConfig.params.[key]'
    return Object.fromEntries(arr) as Record<string, string>;
}

/**
 * A version of JSON.parse that detects Date strings and transforms them back into
 * Date objects. This depends on how dates were serialized obviously.
 *
 * @remarks
 * Source: https://stackoverflow.com/questions/3143070/javascript-regex-iso-datetime
 */
export function parseJsonDateAware(input: string) {
    const dateFormat =
        /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
    // @ts-ignore
    return JSON.parse(input, (key, value) => {
        if (typeof value === 'string' && dateFormat.test(value)) {
            return new Date(value);
        }

        return value;
    });
}

/**
 *
 * @remarks
 * Yes including a full HTML template here in a string goes against many best practices.
 * Yet it also felt wrong to add another dependency to simply parse 1 template.
 * If you have an idea on how to improve this feel free to submit a pull request.
 */
export function html(
    logger: winston.Logger,
    res: any,
    providerConfigKey: string | undefined,
    connectionId: string | undefined,
    error: string | null,
    errorDesc: string | null
) {
    const resultHTMLTemplate = `
<!--
Pizzly OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/Pizzly
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body>
    <noscript>JavaScript is required to proceed with the authentication.</noscript>
    <script type="text/javascript">
      window.providerConfigKey = \`\${providerConfigKey}\`;
      window.connectionId = \`\${connectionId}\`;
      window.authError = \'\${error}\';
      window.authErrorDescription = \'\${errorDesc}\';

      const message = {};

      if (window.authError !== '') {
        message.eventType = 'AUTHORIZATION_FAILED';
        message.data = {
            connectionId: window.connectionId,
            providerConfigKey: window.providerConfigKey,
            error: {
                type: window.authError,
                message: window.authErrorDescription
            }
        };
      } else {
        console.log('I have success!');
        message.eventType = 'AUTHORIZATION_SUCEEDED';
        message.data = { connectionId: window.connectionId, providerConfigKey: window.providerConfigKey };
      }

      // Tell the world what happened
      window.opener && window.opener.postMessage(message, '*');

      // Close the modal
      window.setTimeout(function() {
        window.close()
      }, 300);
    </script>
  </body>
</html>
`;

    const resultHTML = interpolateString(resultHTMLTemplate, {
        providerConfigKey: providerConfigKey,
        connectionId: connectionId,
        error: error?.replace('\n', '\\n'),
        errorDesc: errorDesc?.replace('\n', '\\n')
    });

    if (error) {
        logger.debug(`Got an error in the OAuth flow for provider config "${providerConfigKey}" and connectionId "${connectionId}": ${error} - ${errorDesc}`);
        res.status(500);
    } else {
        res.status(200);
    }
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}
