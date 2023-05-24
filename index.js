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

// --------------------- Posts ---------------------

// Retrieve All
router.get('posts/all', function (req, res) {
    const query = `
    for post in posts
    LIMIT 100
    let user = (
        for v, e in
        OUTBOUND
        post posted_by
        let user = document(e._to)
        return {username: user._key,
                display_name: user.display_name}
    )[0]
    return {body: post.body, user}
    `
    const results = db._query(query).toArray()

    res.send( { results } )
})
.response(joi.object().required(), 'Posts')
.summary('Retrieve all posts')
.description('Retrieves a post by ID');

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


// Delete
router.post('posts/delete', function (req, res) {
    const body = req.body;

    let post;
    try {
        post = col_posts.document(body.post_id);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'Post does not exist');
    }

    const query = `
    let post = document(@post_id)
    for v, e in 1..1
    ANY
    post posted_by
    remove e in posted_by
    remove post in posts
    `;

    const params = { post_id: post._id};

    const result = db._query(query, params).toArray()

    res.send({"status": "200"})
})
.body(joi.object({
    post_id: joi.string().required()
}).required(), 'Post ID')
.summary('Delete a post')
.description("Deletes a post with a given ID, and its related connections.");

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

    const query = `
    insert { body: @body, date: DATE_ISO8601(DATE_NOW()) } 
    into posts
    let post = NEW
    insert { _from: post._id, _to: @user_id } into posted_by
    return post
    `;

    const params = { body: body.post_body, user_id: user._id };
    
    const post = db._query(query, params).toArray()[0]; // this cool? probably not

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

