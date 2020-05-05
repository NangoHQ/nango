import { ErrorMiddlewareTestHarness } from '../../../../tests/utils'
import { TErrorHandlerRequest } from './types'
// @ts-ignore
import { errorHandler } from './error-handler'
import { UserError } from '../../../errors'
import { AuthenticationFailed, NoAuthInProgress } from './errors'

class TestUserError extends UserError {
  constructor() {
    super('test error', 422, 'TEST_ERROR')
  }
}

class TestNoAuthInProgressError extends NoAuthInProgress {}

describe('errorHandler', () => {
  const log = jest.fn()
  const setLogLevel = jest.fn()

  const authenticationFailedError = new AuthenticationFailed({ error: 'oops_code', error_description: 'some error' })
  const nonUserError = new Error('oh noes')

  const setup = ({ withLogger = true, sendResponse = false, url = '' } = {}) =>
    new ErrorMiddlewareTestHarness<TErrorHandlerRequest>({
      configureRequest: (req, res) => {
        req.buid = 'test-buid'
        req.authId = 'test-auth-id'

        if (url.length > 0) {
          req.originalUrl = url
        }

        if (sendResponse) {
          res.send()
        }
      },
      testMiddleware: errorHandler
    })

  beforeEach(() => {
    log.mockClear()
    setLogLevel.mockClear()
  })

  describe('when NoAuthInProgress error is returned to request WITHOUT query params', () => {
    const test = setup({ url: 'v2/auth/callback' })

    it('renders the `callback-url-request-error` template with the expected parameters', async () => {
      await test
        .get(new TestNoAuthInProgressError())
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect(422)
        .type('text/html')

      expect(test.view).toMatchSnapshot()
    })

    it("doesn't pass on the error", async () => {
      await test.get(new TestUserError()).expect(422)

      expect(test.err).toBeUndefined()
    })
  })

  describe('when NoAuthInProgress error is returned to request WITH query params', () => {
    const test = setup({ url: 'v2/auth/callback' })

    it('renders the `oauth-error` template with the expected parameters', async () => {
      await test
        .get(new TestNoAuthInProgressError())
        .query('?hello=world')
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect(422)
        .type('text/html')

      expect(test.view).toMatchSnapshot()
    })

    it("doesn't pass on the error", async () => {
      await test
        .get(new TestUserError())
        .query('?hello=world')
        .expect(422)

      expect(test.err).toBeUndefined()
    })
  })

  describe('when the error is a UserError', () => {
    describe('when there is a logger on the request', () => {
      it("logs the error to the request's logger with ERROR level", async () => {
        const test = setup()

        await test.get(new TestUserError()).expect(422)

        expect(log).toMatchSnapshot()
      })
    })

    describe('when the error is an AuthenticationFailed error', () => {
      it('renders the `callback` template with the expected parameters', async () => {
        const test = setup()

        await test
          .get(authenticationFailedError)
          .expect('Content-Type', 'text/html; charset=utf-8')
          .expect(403)
          .type('text/html')

        expect(test.view).toMatchSnapshot()
      })

      it("doesn't pass on the error", async () => {
        const test = setup()

        await test.get(authenticationFailedError).expect(403)

        expect(test.err).toBeUndefined()
      })
    })

    describe('when the error is NOT an AuthenticationFailed error', () => {
      it('renders the `oauth-error` template with the expected parameters', async () => {
        const test = setup()

        await test
          .get(new TestUserError())
          .expect('Content-Type', 'text/html; charset=utf-8')
          .expect(422)
          .type('text/html')

        expect(test.view).toMatchSnapshot()
      })

      it("doesn't pass on the error", async () => {
        const test = setup()

        await test.get(new TestUserError()).expect(422)

        expect(test.err).toBeUndefined()
      })
    })
  })

  describe('when the error is NOT a UserError', () => {
    it('renders the `oauth-error` template with the expected parameters', async () => {
      const test = setup()

      await test
        .get(nonUserError)
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect(500)
        .type('text/html')

      expect(test.view).toMatchSnapshot()
    })

    it('passes on the error', async () => {
      const test = setup()

      await test.get(nonUserError).expect(500)

      expect(test.err).toBe(nonUserError)
    })
  })

  describe('when headers have already been sent', () => {
    it("doesn't render anything", async () => {
      const test = setup({ sendResponse: true })

      await test.get(nonUserError).expect(200)

      expect(test.view).toBeUndefined()
    })

    it('passes on the error', async () => {
      const test = setup({ sendResponse: true })

      await test.get(nonUserError).expect(200)

      expect(test.err).toBe(nonUserError)
    })
  })
})
