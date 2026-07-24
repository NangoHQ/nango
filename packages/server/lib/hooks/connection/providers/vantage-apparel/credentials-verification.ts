import type { InternalNango as Nango } from '../../credentials-verification-script.js';

const AUTH_FAILURE_CODE = '105';

function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async function execute(nango: Nango) {
    const { credentials, provider_config_key } = nango.getConnection();
    const { username, password } = credentials as { username: string; password: string };

    const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="https://brandedpromoapparel.com/Schema/CustomerLookupService/">
  <soapenv:Body>
    <ns:GetAccountsByEmailRequest>
      <ns:wsVersion>1.0.0</ns:wsVersion>
      <ns:id>${escapeXml(username)}</ns:id>
      <ns:password>${escapeXml(password)}</ns:password>
      <ns:keyword>nango-credentials-check@example.invalid</ns:keyword>
    </ns:GetAccountsByEmailRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await nango.proxy<string>({
        method: 'POST',
        endpoint: '/CustomerLookupService.svc',
        providerConfigKey: provider_config_key,
        headers: {
            'content-type': 'text/xml; charset=utf-8',
            soapaction: '"getAccountsByEmail"'
        },
        data: body
    });

    const raw = typeof (response as { data?: unknown })?.data === 'string' ? (response as { data: string }).data : '';

    if (raw.includes(`<code>${AUTH_FAILURE_CODE}</code>`) && /authentication/i.test(raw)) {
        throw new Error('Incorrect Credentials');
    }
}
