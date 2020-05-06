// import uuidv1 from 'uuid/v1'
import { MiddlewareTestHarness, session } from '../../../../tests/utils'
import { callbackAuthId, connectAuthId } from './auth-id'
import { TAuthIdRequest } from './types'
// import { mocked } from 'ts-jest/utils'

jest.mock('uuid/v1')

// mocked(uuidv1).mockImplementation(() => 'generated-auth-id')

describe('connectAuthId', () => {
  const queryConfig = (req: TAuthIdRequest) => {
    req.buid = 'test-buid'
    req.query.authId = 'query-auth-id'
  }

  const setup = (configureRequest: (req: TAuthIdRequest) => void) =>
    new MiddlewareTestHarness({ configureRequest, setupMiddlewares: [session()], testMiddleware: connectAuthId })

  describe('when the auth id query parameter is set', () => {
    const config = (req: TAuthIdRequest) => {
      req.buid = 'test-buid'
      req.query.authId = 'query-auth-id'
    }

    it('sets the auth id from the query parameter', async () => {
      const test = setup(config)
      await test.get().expect(200)

      expect(test.req.authId).toBe('query-auth-id')
    })
  })

  it('saves the auth id into the session', async () => {
    const test = setup(queryConfig)
    await test.get().expect(200)

    expect(test.req.session.authId).toBe('query-auth-id')
  })
})

describe('callbackAuthId', () => {
  const setup = () =>
    new MiddlewareTestHarness({
      configureRequest: (req: TAuthIdRequest) => {
        req.session.authId = 'session-auth-id'
        req.setupId = 'test-setup-id'
      },
      setupMiddlewares: [session()],
      testMiddleware: callbackAuthId
    })

  it('sets the auth id using the value stored in the session', async () => {
    const test = setup()
    await test.get().expect(200)

    expect(test.req.authId).toBe('session-auth-id')
  })
})
