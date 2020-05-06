import { MiddlewareTestHarness } from '../../../tests/utils'
import { configureAuthDetailsRequest, AuthDetailsRequest } from './configure-request'

describe('configureAuthDetailsRequest', () => {
  const buid = 'test-alias'
  const authId = 'test-auth-id'

  const path = `${buid}/${authId}`

  const setup = () =>
    new MiddlewareTestHarness<AuthDetailsRequest>({
      testMiddleware: configureAuthDetailsRequest,
      pathParams: ['buid', 'authId']
    })

  it('sets the alias and auth id from the path params', async () => {
    const test = setup()

    await test.get(path).expect(200)

    expect(test.req.buid).toBe(buid)
    expect(test.req.authId).toBe(authId)
  })
})
