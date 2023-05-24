'use strict';
const createRouter = require('@arangodb/foxx/router');
const db = require('@arangodb').db;
const joi = require('joi');
const router = createRouter();

module.context.use(router);

