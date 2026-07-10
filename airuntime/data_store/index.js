const { RunStore } = require('./base');
const { SQLiteRunStore } = require('./sqlite');

module.exports = { RunStore, SQLiteRunStore };