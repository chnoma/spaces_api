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

// TODO: Limit scope of data return


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

// New space by path (creates subspaces automatically)
router.post('spaces/create_by_path', function (req, res) {
    const path = req.body.path;
    const elements = path.split("/")
    if (path.slice(0, 1) != "$") {
        res.send(404, "Invalid path")
    } else if (elements.length > 4) {
        res.send(400, "Exceeds maximum depth")
    }

    let query_create_space = `
    let root = document(@root_id)
    insert { name: @name, 
        restricted: @restricted,
        abs_path: @abs_path,
        date_created: DATE_ISO8601(DATE_NOW())} 
    into spaces
    let space = NEW
    insert { _from: root._id, _to: space._id } into space_structure
    return space
    `;

    let query_path = `
    let root_space = (
        FOR space in spaces
            FILTER space.abs_path == @abs_path
            return space
    )[0]
    return root_space
    `;
    
    let x = [];
    let last_space = col_spaces.document("$");

    for(let i = 1; i < elements.length+1; i++) {
        var abs_path = elements.slice(0,i).join("/");
        var space = db._query(query_path, {abs_path: elements.slice(0,i).join("/")}).toArray()[0];
        let name;
        if(space === null) {
            if (i == 1) {
                name = elements[i-1].slice(1);
            } else {
                name = elements[i-1];
            }
            space = db._query(query_create_space, {root_id: last_space._id, name, restricted: false, abs_path: abs_path}).toArray()[0];
        }
        x.push(space);
        last_space = space;
    }

    res.send({x});

})
.body(joi.object({
    path: joi.string().required()
}).required(), 'Desired path of new space')
.summary('Create a new space')
.description("Creates a new space with the supplied name under the root space ID supplied.");

// Retrieve Space by path
router.post('spaces/get_by_path', function (req, res) {
    const path = req.body.path;

    if (path.slice(0, 1) != "$") {
        res.send(404, "Invalid path")
    }

    let query_path = `
    let root_space = (
        FOR space in spaces
            FILTER space.abs_path == @abs_path
            return space
    )[0]
    return root_space
    `;
    
    let space = db._query(query_path, {abs_path: path}).toArray()[0];

    res.send({space});

})
.body(joi.object({
    path: joi.string().required()
}).required(), 'Path to space')
.summary('Retrieve a space by path')
.description("Retrieve a space by path");

// --------------------- Posts ---------------------

// Retrieve All -- we shouldn't have spaces 10 deep ever anyway
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
    let spaces = (
        for v, e in
        OUTBOUND 
        post posted_to
            let space = document(e._to)
            let root = document("spaces/$")
            FOR path IN 0..10 INBOUND K_PATHS
            space TO root
            space_structure
            return path.vertices
    )
    return {body: post.body, key: post._key, user, spaces}
    `
    const results = db._query(query).toArray()

    res.send( { results } )
})
.response(joi.object().required(), 'Posts')
.summary('Retrieve all posts')
.description('Retrieves all posts');

// Retrieve by space
router.get('posts/space/:id', function (req, res) {
    let space;
    try {
        space = col_spaces.document(req.pathParams.id);
    }
    catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'Space does not exist');
    }
    
    const query = `
    let root_space = document(@root_space)
    for space, edge in 0..10 OUTBOUND root_space space_structure
        FOR post IN INBOUND space posted_to
            let user = (
                for v, e in
                OUTBOUND
                post posted_by
                let user = document(e._to)
                return {username: user._key,
                        display_name: user.display_name}
            )[0]
            return {post, space, user}
    `
    const results = db._query(query, {root_space: space._id}).toArray()

    res.send( { results } )
})
.response(joi.object().required(), 'Posts')
.summary('Retrieve all posts from a given space ID')
.description('Retrieve all posts from a given space ID');

// Retrieve posts by space's path
router.post('posts/space_path/', function (req, res) {
    const body = req.body;

    const query = `
    let root_space = (
        FOR space in spaces
            FILTER space.abs_path == @abs_path
            return space
    )[0]
    for space, edge in 0..10 OUTBOUND root_space space_structure
        FOR post IN INBOUND space posted_to
            let user = (
                for v, e in
                OUTBOUND
                post posted_by
                let user = document(e._to)
                return {username: user._key,
                        display_name: user.display_name}
            )[0]
            return {post, space, user}
    `
    const results = db._query(query, {abs_path: body.space_path}).toArray();
    res.send( { results } )
})
.body(joi.object({
    space_path: joi.string().required()
}).required(), 'Spaces absolute path')
.summary('List all posts under a space path')
.description("List all posts under a space with the given absolute path");

// Retrieve post by ID
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


// Delete post
router.post('posts/delete', function (req, res) {
    const body = req.body;

    try {
        const post = col_posts.document(body.post_id);
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

// New post
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

