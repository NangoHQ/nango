import { Request, Response } from 'express'
export default (req: Request, res: Response) => {
  const message = [
    'The requested URL',
    req.originalUrl,
    'could not be found on this server.',
    "Please make sure you've entered the right URL and try again.",
    'For further help, please see https://docs.bearer.sh/help-and-support'
  ].join(' ')
  if (!res.headersSent) {
    // console.log('resourceNotFound', message)
    res.status(404)
    if (req.accepts('html')) {
      res.header('Content-Type', 'text/html')
      res.render('page-not-found-error', {
        method: req.method,
        error: '404: Page Not Found',
        callbackUrl: req.originalUrl
      })
    } else {
      res.header('Content-Type', 'application/json')
      res.json({
        error: {
          message,
          code: 'NOT_FOUND'
        }
      })
    }
  }
}
