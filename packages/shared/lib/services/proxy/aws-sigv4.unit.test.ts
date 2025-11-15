import { describe, expect, it } from 'vitest';

import { signAwsSigV4Request } from './aws-sigv4.js';

import type { AwsSigV4Credentials } from '@nangohq/types';

const baseCredentials: AwsSigV4Credentials = {
    type: 'AWS_SIGV4',
    raw: {},
    role_arn: 'arn:aws:iam::123456789012:role/TestRole',
    region: 'us-east-1',
    service: 'execute-api',
    access_key_id: 'AKIDEXAMPLE',
    secret_access_key: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    session_token: 'session-token'
};

describe('signAwsSigV4Request', () => {
    it('signs GET requests with canonical query params and headers', () => {
        const signed = signAwsSigV4Request({
            url: 'https://example.amazonaws.com/test/resource?baz=qux&foo=bar&baz=aaa',
            method: 'GET',
            headers: { 'content-type': 'application/json' },
            credentials: baseCredentials,
            now: new Date('2025-01-02T03:04:05.000Z')
        });

        expect(signed['authorization']).toBe(
            'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20250102/us-east-1/execute-api/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=3b3a97589b9cd7d1b94293d46a558de6801f06a65442669291c0b6e2126c2550'
        );
        expect(signed['host']).toBe('example.amazonaws.com');
        expect(signed['x-amz-date']).toBe('20250102T030405Z');
        expect(signed['x-amz-content-sha256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('uses unsigned payload hashing when body is explicitly null', () => {
        const signed = signAwsSigV4Request({
            url: 'https://s3.us-west-2.amazonaws.com/example-bucket/object',
            method: 'PUT',
            headers: {},
            body: null,
            credentials: {
                ...baseCredentials,
                region: 'us-west-2',
                service: 's3'
            },
            now: new Date('2025-01-02T03:04:05.000Z')
        });

        expect(signed['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
        expect(signed['authorization']).toContain('/us-west-2/s3/aws4_request');
    });
});
