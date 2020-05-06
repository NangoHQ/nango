import { MiddlewareTestHarness } from '../../../../tests/utils'
// import { revokeAuthV3 } from '../../clients/integrations'
import { revoke } from './revoke'

jest.mock('../../clients/integrations')

describe('revoke', () => {
  const path = 'test-buid/test-auth-id'

  const setup = () =>
    new MiddlewareTestHarness({
      configureRequest: (req: any) => {
        req.buid = 'test-buid'
      },
      testMiddleware: revoke,
      pathParams: ['buid', 'authId']
    })

  // it('revokes the authentication', async () => {
  //   await setup()
  //     .get(path)
  //     .query('clientId=test-client-id')
  //     .expect(200)

  //   expect(revokeAuthV3).toMatchSnapshot()
  // })

  it('raises an error if the clientId parameter is missing', async () => {
    const test = setup()

    await test.get(path).expect(400)

    expect(test.err).toMatchSnapshot()
  })
})
