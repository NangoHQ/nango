import { expandAuthConfig, OAuth1AuthConfig, OAuth2AuthCodeConfig } from './auth-config'
import { EAuthType, OAuth1SignatureMethod } from '../auth/v3/types'
import { BodyFormat, AuthorizationMethod } from '../auth/clients/oauth2'
import { GrantType } from '../auth/v3/strategies/oauth2'

describe('expandAuthConfig', () => {
  const connectParams = {
    param1: 'one',
    param2: 'two'
  }

  describe('when the auth type is OAuth 1', () => {
    const authConfig: OAuth1AuthConfig = {
      authType: EAuthType.OAuth1,
      accessTokenURL: 'http://auth.${connectParams.param1}.example.com/access',
      authorizationParams: {
        auth: 'auth-param-${connectParams.param2}'
      },
      requestTokenURL: 'http://auth.${connectParams.param2}.example.com/token',
      signatureMethod: OAuth1SignatureMethod.PlainText,
      tokenParams: {
        token: 'token-param-${connectParams.param1}'
      },
      userAuthorizationURL: 'http://auth.${connectParams.param2}.example.com/auth'
    }

    it('expands variables in supported variables', () => {
      expect(expandAuthConfig({ connectParams, authConfig })).toMatchSnapshot()
    })

    it('leaves other parts of the config alone', () => {
      const invalidAuthConfig: any = {
        authType: EAuthType.OAuth1,
        signatureMethod: 'sig-${connectParams.param1}'
      }

      expect(expandAuthConfig({ connectParams, authConfig: invalidAuthConfig })).toMatchSnapshot()
    })
  })

  describe('when the auth type is OAuth 2', () => {
    const authCodeAuthConfig: OAuth2AuthCodeConfig = {
      authType: EAuthType.OAuth2,
      authorizationMethod: AuthorizationMethod.Header,
      authorizationParams: {
        auth: 'auth-param-${connectParams.param2}'
      },
      authorizationURL: 'http://auth.${connectParams.param1}.example.com/auth',
      bodyFormat: BodyFormat.JSON,
      config: {
        scope: ['read', 'write']
      },
      grantType: GrantType.AuthCode,
      tokenParams: {
        token: 'token-param-${connectParams.param1}'
      },
      tokenURL: 'http://auth.${connectParams.param2}.example.com/token',
      refreshURL: 'http://auth.${connectParams.param1}.example.com/refresh'
    }

    it('expands variables in supported variables', () => {
      expect(expandAuthConfig({ connectParams, authConfig: authCodeAuthConfig })).toMatchSnapshot()
    })

    it('leaves other parts of the config alone', () => {
      const invalidAuthConfig: any = {
        authType: EAuthType.OAuth2,
        grantType: GrantType.AuthCode,
        authorizationMethod: 'auth-meth-${connectParams.param1}',
        bodyFormat: 'body-fmt-${connectParams.param2}',
        config: {
          scope: ['scope-${connectParams.param1}']
        }
      }

      expect(expandAuthConfig({ connectParams, authConfig: invalidAuthConfig })).toMatchSnapshot()
    })
  })

  it('returns an error if an invalid variable is encountered', () => {
    const invalidAuthConfig: any = {
      tokenURL: '${invalid.var}'
    }

    expect(() => expandAuthConfig({ connectParams, authConfig: invalidAuthConfig })).toThrowErrorMatchingSnapshot()
  })

  it('returns an error if a required header is missing', () => {
    const invalidAuthConfig: any = {
      tokenURL: '${connectParams.someParam}'
    }

    expect(() => expandAuthConfig({ connectParams, authConfig: invalidAuthConfig })).toThrowErrorMatchingSnapshot()
  })
})
