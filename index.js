'use strict';

const bodyParser = require('body-parser');
const env = require('node-env-file');
const express = require('express');
const logger = require('heroku-logger')
const morgan = require('morgan');
const session = require('express-session');

env(__dirname + '/.env', {raise: false});

const db = require('./db');
const passport = require('./passport');
const routes = require('./routes');
const xhub = require('./xhub');

const app = express();
app.set('port', (process.env.PORT || 5000));
app.set('view engine', 'pug');
app.set('json spaces', 2);

app.use(express.static('static'));
app.use(bodyParser.json({ verify: xhub }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
}));
app.use(passport.initialize());
app.use(passport.session());

morgan.token('uid', (req, res) => req.user ? req.user.id : null);
app.use(morgan(':method :url :status :response-time ms :uid'));
app.use(routes);

db
  .authenticate()
  .then(() => {
    logger.info('Connected to database.');
    app.listen(app.get('port'), () => {
      logger.info(`App is running on port ${app.get('port')}.`);
    });
  });
