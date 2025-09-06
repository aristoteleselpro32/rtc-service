const express = require('express');
const router = express.Router();
const { iniciarLlamadaREST, finalizarLlamadaREST } = require('./controllers');
const redis = require('./config');

module.exports = (io) => {
  router.post('/llamada', (req, res, next) => {
    req.redis = redis;
    req.io = io;
    next();
  }, iniciarLlamadaREST);

  router.post('/llamada/finalizar', (req, res, next) => {
    req.redis = redis;
    req.io = io;
    next();
  }, finalizarLlamadaREST);

  return router;
};
