import { createPrivateKey } from 'crypto';

import { v4 as uuidv4 } from 'uuid';
import { SignedXml } from 'xml-crypto';
import { DOMImplementation, XMLSerializer } from 'xmldom';

import { Err, Ok } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';
import { formatPem, interpolateObject, interpolateString } from '../utils/utils.js';

import type { ProviderTwoStep } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type StringFieldHandler = (value: string, options: SamlAssertionOptions) => void;
type ObjectFieldHandler = (value: Record<string, any>, options: SamlAssertionOptions, context: Record<string, any>) => void;

interface SamlAssertionOptions {
    uid?: string;
    issuer: string;
    lifetimeInSeconds?: number;
    audiences?: string | string[];
    recipient?: string;
    inResponseTo?: string;
    attributes?: Record<string, string | number | boolean | (string | number | boolean)[]>;
    includeAttributeNameFormat?: boolean;
    typedAttributes?: boolean;
    sessionIndex?: string;
    nameIdentifier?: string;
    nameIdentifierFormat?: string;
    authnContextClassRef?: string;
    key?: string;
    cert?: string;
}

const STRING_FIELD_HANDLERS: Record<string, StringFieldHandler> = {
    issuer: (value, options) => {
        options.issuer = value;
    },
    uid: (value, options) => {
        options.uid = value;
    },
    lifetimeInSeconds: (value, options) => {
        options.lifetimeInSeconds = parseInt(value, 10);
    },
    audiences: (value, options) => {
        options.audiences = value.includes(',') ? value.split(',') : value;
    },
    recipient: (value, options) => {
        options.recipient = value;
    },
    inResponseTo: (value, options) => {
        options.inResponseTo = value;
    },
    sessionIndex: (value, options) => {
        options.sessionIndex = value;
    },
    nameIdentifier: (value, options) => {
        options.nameIdentifier = value;
    },
    nameIdentifierFormat: (value, options) => {
        options.nameIdentifierFormat = value;
    },
    authnContextClassRef: (value, options) => {
        options.authnContextClassRef = value;
    },
    key: (value, options) => {
        options.key = value;
    },
    cert: (value, options) => {
        options.cert = value;
    },
    includeAttributeNameFormat: (value, options) => {
        options.includeAttributeNameFormat = value === 'true';
    },
    typedAttributes: (value, options) => {
        options.typedAttributes = value === 'true';
    }
};

// for additonal extra fields
const OBJECT_FIELD_HANDLERS: Record<string, ObjectFieldHandler> = {
    attributes: (value, options, context) => {
        const interpolated = interpolateObject(value, context);
        options.attributes = interpolated;
    }
};

const NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:assertion';

function uid(len: number = 32) {
    return uuidv4().replace(/-/g, '').slice(0, len);
}

/**
 * build saml xml doc
 */
function buildSamlDocument(options: SamlAssertionOptions) {
    const dom = new DOMImplementation();
    const doc = dom.createDocument(NAMESPACE, 'saml:Assertion', null);

    const root = doc.documentElement;
    const now = new Date();

    root.setAttribute('ID', '_' + (options.uid || uid()));
    root.setAttribute('Version', '2.0');
    root.setAttribute('IssueInstant', now.toISOString());

    const issuer = doc.createElementNS(NAMESPACE, 'saml:Issuer');
    issuer.textContent = options.issuer;
    root.appendChild(issuer);

    const subject = doc.createElementNS(NAMESPACE, 'saml:Subject');
    const nameID = doc.createElementNS(NAMESPACE, 'saml:NameID');
    if (options.nameIdentifier) nameID.textContent = options.nameIdentifier;

    nameID.setAttribute('Format', options.nameIdentifierFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified');
    subject.appendChild(nameID);

    const subConfirm = doc.createElementNS(NAMESPACE, 'saml:SubjectConfirmation');

    subConfirm.setAttribute('Method', 'urn:oasis:names:tc:SAML:2.0:cm:bearer');

    const subConfirmData = doc.createElementNS(NAMESPACE, 'saml:SubjectConfirmationData');
    if (options.recipient) subConfirmData.setAttribute('Recipient', options.recipient);
    if (options.inResponseTo) subConfirmData.setAttribute('InResponseTo', options.inResponseTo);

    const lifetimeSeconds = options.lifetimeInSeconds ?? 300;
    const notOnOrAfter = new Date(now.getTime() + lifetimeSeconds * 1000);
    subConfirmData.setAttribute('NotOnOrAfter', notOnOrAfter.toISOString());

    subConfirm.appendChild(subConfirmData);
    subject.appendChild(subConfirm);
    root.appendChild(subject);

    const conditions = doc.createElementNS(NAMESPACE, 'saml:Conditions');

    conditions.setAttribute('NotBefore', now.toISOString());
    conditions.setAttribute('NotOnOrAfter', notOnOrAfter.toISOString());

    const audiences = options.audiences ? (Array.isArray(options.audiences) ? options.audiences : [options.audiences]) : [];
    if (audiences.length) {
        const audRestrict = doc.createElementNS(NAMESPACE, 'saml:AudienceRestriction');
        audiences.forEach((aud) => {
            const a = doc.createElementNS(NAMESPACE, 'saml:Audience');
            a.textContent = aud;
            audRestrict.appendChild(a);
        });
        conditions.appendChild(audRestrict);
    }
    root.appendChild(conditions);

    const authnStatement = doc.createElementNS(NAMESPACE, 'saml:AuthnStatement');
    authnStatement.setAttribute('AuthnInstant', now.toISOString());
    if (options.sessionIndex) authnStatement.setAttribute('SessionIndex', options.sessionIndex);

    const authnCtx = doc.createElementNS(NAMESPACE, 'saml:AuthnContext');

    const ctxRef = doc.createElementNS(NAMESPACE, 'saml:AuthnContextClassRef');
    ctxRef.textContent = options.authnContextClassRef || 'urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified';
    authnCtx.appendChild(ctxRef);

    authnStatement.appendChild(authnCtx);
    root.appendChild(authnStatement);

    if (options.attributes) {
        const attrStmt = doc.createElementNS(NAMESPACE, 'saml:AttributeStatement');
        attrStmt.setAttribute('xmlns:xs', 'http://www.w3.org/2001/XMLSchema');
        attrStmt.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');

        Object.entries(options.attributes).forEach(([name, val]) => {
            const values = Array.isArray(val) ? val : [val];
            if (values.every((v) => typeof v === 'undefined')) return;

            const attrEl = doc.createElementNS(NAMESPACE, 'saml:Attribute');
            attrEl.setAttribute('Name', name);

            attrEl.setAttribute('NameFormat', 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic');

            values.forEach((v) => {
                if (typeof v !== 'undefined') {
                    const valEl = doc.createElementNS(NAMESPACE, 'saml:AttributeValue');

                    valEl.setAttribute('xsi:type', 'xs:string');
                    valEl.textContent = String(v);

                    attrEl.appendChild(valEl);
                }
            });

            attrStmt.appendChild(attrEl);
        });

        root.appendChild(attrStmt);
    }

    return doc;
}

function generatePrivateKey(privateKey: string): string {
    const normalizedKey = privateKey.replace(/\\n/g, '\n');
    let base64Content = normalizedKey
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s+/g, '');

    // specific to sap-successfactors key format for now
    // TODO: make this more generic for other providers if need be
    let decodedBuffer = Buffer.from(base64Content, 'base64');
    const decodedString = decodedBuffer.toString('utf-8');

    if (decodedString.startsWith('MII')) {
        decodedBuffer = Buffer.from(decodedString, 'base64');
        base64Content = decodedBuffer.toString('base64');
    }

    const pem = formatPem(base64Content, 'PRIVATE KEY');

    try {
        const keyObj = createPrivateKey({ key: pem, format: 'pem' });
        return keyObj.export({ type: 'pkcs8', format: 'pem' }) as string;
    } catch (err) {
        throw new AuthCredentialsError('invalid_private_key_format', { cause: err });
    }
}

function signXml(doc: Document, privateKey: string) {
    const serializer = new XMLSerializer();
    const xml = serializer.serializeToString(doc);

    const sig = new SignedXml({
        privateKey: generatePrivateKey(privateKey),
        // TODO: make this more generic for other providers if need be, using sha256 for now
        canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    });

    sig.addReference({
        xpath: "//*[local-name()='Assertion']",
        transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
    });

    sig.computeSignature(xml, {
        location: {
            reference: "//*[local-name()='Issuer']",
            action: 'after'
        }
    });

    return sig.getSignedXml();
}

// signing of the saml assertion is optional
function createUnsignedAssertion(options: SamlAssertionOptions): string {
    const doc = buildSamlDocument(options);
    const xml = new XMLSerializer().serializeToString(doc);
    return Buffer.from(xml).toString('base64');
}

function createSignedAssertion(options: SamlAssertionOptions): string {
    const doc = buildSamlDocument(options);
    const xml = options.key ? signXml(doc, options.key) : new XMLSerializer().serializeToString(doc);
    return Buffer.from(xml).toString('base64');
}

export function generateAssertion({
    provider,
    dynamicCredentials,
    connectionConfig,
    assertionOption
}: {
    provider: ProviderTwoStep;
    dynamicCredentials: Record<string, any>;
    connectionConfig: Record<string, string>;
    assertionOption?: Record<string, any>;
}): Result<string, AuthCredentialsError> {
    try {
        const providerAssertion = provider.assertion;
        if (!providerAssertion) {
            return Err(new AuthCredentialsError('missing_assertion_config'));
        }

        const samlOptions: SamlAssertionOptions = {
            issuer: ''
        };

        const interpolationValues = {
            credentials: dynamicCredentials,
            connectionConfig: connectionConfig || {},
            assertionOption: assertionOption || {}
        };

        for (const [key, value] of Object.entries(providerAssertion)) {
            if (value == null) {
                continue;
            }

            if (typeof value === 'object') {
                const handler = OBJECT_FIELD_HANDLERS[key];
                if (handler) {
                    handler(value, samlOptions, interpolationValues);
                }
            } else if (typeof value === 'string') {
                const interpolated = interpolateString(value, interpolationValues);
                const handler = STRING_FIELD_HANDLERS[key];
                if (handler) {
                    handler(interpolated, samlOptions);
                }
            }
        }

        const assertion = samlOptions.key ? createSignedAssertion(samlOptions) : createUnsignedAssertion(samlOptions);

        return Ok(assertion);
    } catch (err) {
        return Err(new AuthCredentialsError('failed_to_generate_assertion', { cause: err }));
    }
}
