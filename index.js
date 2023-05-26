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



// -------------------- Spaces ---------------------

// New
router.post('spaces/create', function (req, res) {
    const body = req.body;

    let root_space;
    try {
        root_space = col_spaces.document(body.root_id);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'A valid root for the space must be provided');
    }

    const query = `
    let root = document(@root_id)
    insert { name: @name, 
        restricted: @restricted,
        date_created: DATE_ISO8601(DATE_NOW())} 
    into spaces
    let space = NEW
    insert { _from: root._id, _to: space._id } into space_structure
    return space
    `;

    const params = { name: body.name, root_id: body.root_id, restricted: body.restricted };
    
    const space = db._query(query, params).toArray()[0]; // this cool? probably not

    res.send({space_id: space._id});

})
.body(joi.object({
    root_id: joi.string().required(),
    name: joi.string().required(),
    restricted: joi.boolean().required()
}).required(), 'Root space ID, name of new space, and whether it is a write protected space or not')
.response(joi.object({
    space: joi.string().required()
}).required(), 'Resulting space ID')
.summary('Create a new space')
.description("Creates a new space with the supplied name under the root space ID supplied.");


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
    return {body: post.body, key: post._key, user}
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

    let space;
    try {
        space = col_spaces.document(body.space_id);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'Space does not exist');
    }

    const query = `
    insert { body:@body, date_created: DATE_ISO8601(DATE_NOW()) } 
    into posts
    let post = NEW
    insert { _from: post._id, _to: @user_id } into posted_by
    insert { _from: post._id, _to: @space_id } into posted_to
    return post
    `;

    const params = { body: body.post_body, user_id: user._id, space_id: space._id };
    
    const post = db._query(query, params).toArray()[0]; // this cool? probably not

    res.send({post_id: post._id});

})
.body(joi.object({
    post_body: joi.string().required(),
    user_id: joi.string().required(),
    space_id: joi.string().required()
}).required(), 'Post body, Space ID, and user ID')
.response(joi.object({
    post_id: joi.string().required()
}).required(), 'Resulting post ID')
.summary('Create a new post')
.description("Creates a new post with the supplied properties.");

