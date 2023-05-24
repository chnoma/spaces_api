'use strict';
const createRouter = require('@arangodb/foxx/router');
const db = require('@arangodb').db;
const joi = require('joi');
const errors = require('@arangodb').errors;
const DOC_NOT_FOUND = errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code;

const col_posts = db._collection('posts');
const col_users = db._collection('users');
const col_spaces = db._collection('spaces');

const router = createRouter();
module.context.use(router);

// TODO: Access validation accross the board

// Posts
router.get('posts/:id', function (req, res) {
    try {
        const data = col_posts.document(req.pathParams.id);
        res.send(data);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'post does not exist');
    }
})
.pathParam('id', joi.string().required(), 'Post ID')
.response(joi.object().required(), 'Post Data')
.summary('Retrieve a post by ID')
.description('Retrieves a post by ID');