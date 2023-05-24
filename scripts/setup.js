'use strict';
const db = require('@arangodb').db;

const required_document_collections = [
    "users",
    "spaces",
    "posts"
]

const required_edge_collections = [
    "follows",
    "likes",
    "space_structure",
    "posted_by",
    "post_space"
]

const root_spaces_protected = {
    "admin": true,
    "social": false,
    "tech": false,
    "science": false,
    "art": false,
    "entertainment": false,
    "gaming": false,
    "politics": false,
}


if (!db._collection("users")) {
    db._createDocumentCollection("users");
}
if (!db._collection("spaces")) {
    db._createDocumentCollection("spaces");
}
if (!db._collection("posts")) {
    db._createDocumentCollection("posts");
}


if (!db._collection("follows")) {
    db._createEdgeCollection("follows");
}
if (!db._collection("likes")) {
    db._createEdgeCollection("likes");
}
if (!db._collection("space_structure")) {
    db._createEdgeCollection("space_structure");
}
if (!db._collection("posted_by")) {
    db._createEdgeCollection("posted_by");
}
if (!db._collection("post_space")) {
    db._createEdgeCollection("post_space");
}