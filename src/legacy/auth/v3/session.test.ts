// import expressSession from 'express-session'
// import { mocked } from 'ts-jest/utils'
import { destroySession, destroySessionOnError } from './session'
import { MiddlewareTestHarness, ErrorMiddlewareTestHarness, session as testSession } from '../../../../tests/utils'

jest.mock('express-session')

describe('session', () => {
  // const mockSession = {}

  beforeEach(() => {
    // mocked(expressSession)
    //   .mockImplementationOnce(() => mockSession)
    //   .mockClear()
  })
})

describe('destroySession', () => {
  const error = new Error('oops')

  const setup = (errorOnDestroy = false) =>
    new MiddlewareTestHarness({
      configureRequest: req => {
        expect(req.session).not.toBeUndefined()

        if (errorOnDestroy) {
          req.session!.destroy = jest.fn(callback => callback(error))
        }
      },
      setupMiddlewares: [testSession()],
      testMiddleware: destroySession
    })

  it('destroys the session', async () => {
    const test = setup()

    await test.get().expect(200)

    expect(test.req.session).toBeUndefined()
  })

  it('passes on the error if there was a problem destroying the session', async () => {
    const test = setup(true)

    await test.get().expect(500)

    expect(test.err).toBe(error)
  })
})

describe('destroySessionOnError', () => {
  const error = new Error('oops')
  const sessionError = new Error('destroy failed')

  const setup = ({ errorOnDestroy = false, withSession = true } = {}) =>
    new ErrorMiddlewareTestHarness({
      configureRequest: req => {
        if (withSession) {
          expect(req.session).not.toBeUndefined()
        }

        if (errorOnDestroy) {
          req.session!.destroy = jest.fn(callback => callback(sessionError))
        }
      },
      setupMiddlewares: withSession ? [testSession()] : undefined,
      testMiddleware: destroySessionOnError
    })

  it('destroys the session', async () => {
    const test = setup()

    await test.get(error).expect(500)

    expect(test.req.session).toBeUndefined()
  })

  describe('when the session was destroyed succesfully', () => {
    it('passes on the original error', async () => {
      const test = setup({ errorOnDestroy: true })

      await test.get(error).expect(500)

      expect(test.err).toBe(error)
    })
  })

  describe('when there was a problem destroying the session', () => {
    it('passes on the original error', async () => {
      const test = setup({ errorOnDestroy: true })

      await test.get(error).expect(500)

      expect(test.err).toBe(error)
    })
  })

  describe('when there was no active session', () => {
    it('does nothing', async () => {
      const test = setup({ withSession: false })

      await test.get(error).expect(500)

      expect(test.err).toBe(error)
    })
  })
})
