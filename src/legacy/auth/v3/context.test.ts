import { MiddlewareTestHarness, session } from '../../../../tests/utils'
import { TConnectContextRequest, TCallbackContextRequest } from './types'
import { connectContext, callbackContext } from './context'

const buid = 'test-buid'
const clientId = 'test-client-id'
const setupId = 'test-setup-id'
const envId = 'test-env-123456'
const userCorrelationId = 'user-corr-123'
const internalCorrelationId = 'int-corr-456'
const queryStringBase = `clientId=${clientId}&setupId=${setupId}&correlationId=${userCorrelationId}`
const queryString = `${queryStringBase}&params[conParam]=test-con-param`
const connectParams = { conParam: 'test-con-param' }

describe('connectContext', () => {
  const setup = () =>
    new MiddlewareTestHarness<TConnectContextRequest>({
      setupMiddlewares: [session()],
      testMiddleware: connectContext,
      pathParams: ['buid'],
      configureRequest: (req, _res) => {
        req.buid = 'test-buid'
        req.session.context = {} as any
        req.setupId = setupId
      }
    })

  it('sets up the logger from the request', async () => {
    const test = setup()
    await test
      .get(buid)
      .query(queryString)
      .expect(200)
  })

  it('saves the `params` values as the connect params', async () => {
    const test = setup()

    await test
      .get(buid)
      .query(queryString)
      .expect(200)

    expect(test.req.connectParams).toEqual(connectParams)
  })

  it('validates the format of the connect params', async () => {
    const test = setup()

    await test
      .get(buid)
      .query(`${queryStringBase}&params=oops`)
      .expect(400)

    // tslint:disable:max-line-length
    expect(test.err).toMatchInlineSnapshot(`
[InvalidConnectParams: Incorrect format for connect parameters'

Connect parameters must be sent as query parameters of the form \`params[name]=value\` eg. \`params[subdomain]=my-app\`']
`)
    // tslint:enable:max-line-length
  })

  it('validates the format of an individual connect param', async () => {
    const test = setup()

    await test
      .get(buid)
      .query(`${queryString}&params[invalidParam]=http://naughty.example.com`)
      .expect(400)

    expect(test.err).toMatchInlineSnapshot(`
[InvalidConnectParam: Incorrect format for connect parameter 'invalidParam'

Connect parameters may contain alphanumeric and space characters, or any of the following symbols '_-.'

Refer to this link for further information: https://docs.bearer.sh/faq/connect-button]
`)
  })

  describe('when assigning clientId from query param', () => {
    it('sets the clientId using the environment id', async () => {
      const test = setup()

      await test
        .get(buid)
        .query(queryString)
        .expect(200)

      expect(test.req.clientId).toBe(envId)
    })

    it('raises an error if the clientId query parameter is not present', async () => {
      const test = setup()

      await test.get(buid).expect(400)

      expect(test.err).toMatchSnapshot()
    })
  })

  it('stores the context data in the session', async () => {
    const test = setup()

    await test
      .get(buid)
      .query(queryString)
      .expect(200)

    expect(test.req.session.context).toMatchSnapshot()
  })
})

describe('callbackContext', () => {
  const environmentIdentifier = 'test-643'
  const organizationIdentifier = 'test-5463738'
  const setup = (localAuth = false) =>
    new MiddlewareTestHarness<TCallbackContextRequest>({
      configureRequest: req => {
        req.session.context = {
          clientId,
          connectParams,
          setupId,
          buid,
          environmentIdentifier,
          internalCorrelationId,
          organizationIdentifier,
          userCorrelationId,
          localAuth
        }
      },
      setupMiddlewares: [session()],
      testMiddleware: callbackContext
    })

  it('loads the context from the session', async () => {
    const test = setup()

    await test.get().expect(200)

    expect(test.req).toMatchObject({
      setupId,
      buid,
      connectParams,
      localAuth: false,
      clientId: environmentIdentifier
    })
  })

  it('raises a NoAuthInProgress error if there is no session data', async () => {
    const test = new MiddlewareTestHarness({
      setupMiddlewares: [session()],
      testMiddleware: callbackContext
    })

    await test.get().expect(422)

    expect(test.err).toMatchSnapshot()
  })
})
