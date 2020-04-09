import { check } from './constantsCheck'

let initial: any

describe('check', () => {
  describe('do not raise error if all variables are present', () => {
    it('passes', () => {
      expect(check).not.toThrowError()
    })
  })

  describe('when missing an env variable or is falsy', () => {
    beforeAll(() => {
      // needed to have constants file reloaded properly
      jest.resetModules()
      initial = process.env['HIT_NOTIFIER_LAMBDA_NAME']
      process.env = {
        ...process.env,
        HIT_NOTIFIER_LAMBDA_NAME: undefined
      }
    })

    afterAll(() => {
      process.env['HIT_NOTIFIER_LAMBDA_NAME'] = initial
    })

    describe('without a notifier', () => {
      it('throws an error', () => {
        expect(check).toThrowError('Missing environment variable HIT_NOTIFIER_LAMBDA_NAME')
      })
    })

    describe('when a notifier is given', () => {
      it('throws an error', () => {
        const notifier = {
          notify: jest.fn()
        }

        expect(() => {
          check(notifier)
        }).toThrowError('Missing environment variable HIT_NOTIFIER_LAMBDA_NAME')

        expect(notifier.notify.mock.calls[0][0].toJSON()).toMatchObject({
          severity: 'error',
          severityReason: {
            attributes: { variableName: 'HIT_NOTIFIER_LAMBDA_NAME' },
            type: 'missingEnvVariable'
          }
        })

        expect(notifier.notify).toHaveBeenCalledTimes(1)
      })
    })
  })
})
