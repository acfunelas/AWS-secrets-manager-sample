const environment = process.env.NODE_ENV || 'development'
const express = require('express')
const helmet = require('helmet')
const pg = require('pg')
const path = require('path')

const app = express()
const server = require('http').createServer(app)
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

app.use(helmet())

app.use( // This should be updated too if we have https in the production side
  helmet.contentSecurityPolicy({
    directives: {
      'default-src': ["'self'", 'https://js.stripe.com'],
      'img-src':["'self'", 'https://thrive-resources.s3.us-east-1.amazonaws.com',"'unsafe-inline'"],
      'font-src': ["'self'", 'http:', 'data:', 'https://js.stripe.com '],
      'style-src': ["'self'", 'http:', "'unsafe-inline'"],
      'script-src': ["'self'", 'http:',"'unsafe-inline'", "'unsafe-eval'", 'https://js.stripe.com'],
      'object-src': ["'none'"],
      'connect-src': ["'self'", 'https://api.stripe.com', 'https://server-domain.com', 'http://app.hireklever.com/socket.io', '*'],
      'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com ', "'unsafe-inline'"],
    }
  })
)

app.use(express.json({
	limit: '500mb'
}))

app.use(express.urlencoded({
  extended: true,
  limit: '500mb'
}))

const getSecret = async() => {
  const secret_name = "database/knexfile";
  const client = new SecretsManagerClient({
    region: "us-east-1",
  });
  
  let response;
  
  try {
    response = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
      })
    );
  } catch (error) {
    // For a list of exceptions thrown, see
    // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
    throw error;
  }
  
  const secret = response.SecretString;
  console.log(secret)
  return secret
}

getSecret()
// db setup
const dbConfig = getSecret()
const _dbConfig = { ...dbConfig }
delete _dbConfig.migrations

pg.types.setTypeParser(1114, str => str)

const knex = require('knex')({
  ..._dbConfig
})
// if (environment == 'production') {
//  app.set('trust proxy', 'loopback') // trust first proxy. for https and with proxy
//  _sess.cookie.secure = true // serve secure cookies
// }

// serve production assets
app.use(express.static(__dirname + "/client/build"));
// app.use(express.static('public'))

// middlewares
app.use((req, res, next) => {
  res.locals.knex = knex
  next()
})

// Public routes here
const publicRoutes = require('./routes/public')
publicRoutes(app)

// Middlewares before private routes
app.use((req, res, next) => {
  // if (!req.session.user_id) {
  //   res.json("Accessss denied")
  //   return
  // }

  next()
})

// Private routes here
const privateRoutes = require('./routes/private')
// const { UUID } = require('bson')
privateRoutes(app)

app.use((req, res, next) => {
  res.on('finish', () => {
    // execute middlewares after routes
  })

  next()
})

if (environment === 'production') {
  app.get('/*', (req, res) => {
    if (res.headersSent) return

    res.sendFile(path.resolve(__dirname, 'client/build', 'index.html'))
  })
}

server.listen(4301).setTimeout(1000 * 10 * 60)