'use strict';
const createRouter = require('@arangodb/foxx/router');
const db = require('@arangodb').db;
const joi = require('joi');
const errors = require('@arangodb').errors;
const DOC_NOT_FOUND = errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code;

const col_posts = db._collection('posts');
const col_users = db._collection('users');
const col_spaces = db._collection('spaces');

const edge_posted_by = db._collection('posted_by');
const edge_follows = db._collection('follows');
const edge_space_structure = db._collection('space_structure');
const edge_likes = db._collection('likes');
const edge_post_space = db._collection('post_space');

const router = createRouter();
module.context.use(router);

// TODO: Access validation accross the board

// Posts

// New
router.post('posts/create', function (req, res) {
    const body = req.body;
    
    let user;
    try {
        user = col_users.document(body.user_id);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'User does not exist');
    }
    
    const post = col_posts.save( {body: body.post_body} );

    edge_posted_by.save({ _from: post._id, _to: user._id });

    res.send({post_id: post._id});

})
.body(joi.object({
    post_body: joi.string().required(),
    user_id: joi.string().required()
}).required(), 'Post body and user ID')
.response(joi.object({
    post_id: joi.string().required()
}).required(), 'Resulting post ID')
.summary('Create a new post')
.description("Creates a new post with the supplied body under the supplied user's profile.");


// Retrieve
router.get('posts/get/:id', function (req, res) {
    try {
        const data = col_posts.document(req.pathParams.id);
        res.send(data);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'Post does not exist');
    }
})
.pathParam('id', joi.string().required(), 'Post ID')
.response(joi.object().required(), 'Post Data')
.summary('Retrieve a post by ID')
.description('Retrieves a post by ID');