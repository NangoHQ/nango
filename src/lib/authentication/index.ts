import { Request, Response, NextFunction } from 'express'

const basic = (req: Request, res: Response, next: NextFunction) => {
  const credentials = {
    user: process.env.AUTHENTICATION_USER,
    password: process.env.AUTHENTICATION_PASSWORD
  }

  if (!credentials.user && !credentials.password) {
    next()
    return
  }

  const authorizationHeader = req.get('authorization')

  if (!authorizationHeader) {
    res.status(401)
    res.setHeader('WWW-Authenticate', 'Basic')
    res.render('401')
    return
  }

  const basicAsBase64 = authorizationHeader.split('Basic ').pop() || ''
  const basicAsBuffer = Buffer.from(basicAsBase64, 'base64')
  const basicAsString = basicAsBuffer.toString('utf-8')

  const providedCredentials = basicAsString.split(':')
  const providedUser: string = providedCredentials.shift() || ''
  const providedPassword: string = providedCredentials.shift() || ''

  if (providedUser !== credentials.user || providedPassword !== credentials.password) {
    res.status(401)
    res.setHeader('WWW-Authenticate', 'Basic')
    res.render('401')
    return
  }

  next()
}

export const authentication = { basic }
