var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Vote = require('../models/Vote');
var votesController = exports;

// generic vote controller
exports.voteFor = function (type, root) {

  return function (req, res, next) {

    var item_id;

    req.assert('amount', 'Items can only be upvoted.').equals('1');
    req.assert('id', 'Invalid item id.').notEmpty();

    var errors = req.validationErrors();

    if (errors) {
      req.flash('errors', errors);
      return res.redirect(req.get('referrer') || root);
    }

    if (!req.user) {
      req.flash('errors', { msg: 'Only members can upvote items.' });
      return res.redirect('/signup');
    }

    try {
      item_id = new mongoose.Types.ObjectId(req.params.id);
    } catch(e) {
      item_id = req.params.id.toString();
    }

    var vote = new Vote({
      item: item_id,
      voter: req.user.id,
      amount: req.body.amount,
      itemType: type
    });

    vote.save(function (err) {
      if (err) {
        if (err.code === 11000) {
          req.flash('errors', { msg: 'You can only upvote an item once.' });
        }
        console.log(err);
        return res.redirect(req.get('referrer') || root);
      }

      req.flash('success', { msg: 'Item upvoted. Awesome!' });
      res.redirect(req.get('referrer') || root);
    });
  };

};

// generic vote retrieval
/**
 * Query the Votes collection to find votes for item(s)
 * @param  {String}           type     Type of item. Should be `news`, `comment`, or `issue`
 * @param  {String | Array}   id       Either a string or an array of strings (or object id's) defining the item(s) to be queried about
 * @param  {Function}         callback Evaluated with an error as the first parameter and the votes found as the second
 */
exports.retrieveVotesFor = function (type, id, callback) {

  if(arguments.length === 1) {
    return function (id, callback) {
      return votesController.retrieveVotesFor(type, id, callback);
    };
  }

  // special case of allowing a null type for news
  if(type === 'news') {
    type = { $in: ['news', null] };
  }

  // pass an array of ids to find votes for all of them
  if(Array.isArray(id)) {
    id = { $in: id };
  }

  Vote
  .find({
    item: id,
    itemType: type
  })
  .exec(callback);
};

// add a `votes` count and `votedFor` property for a particular item, vote array, and user
exports.addVotesToItem = function (item, item_id, user, votes) {

  item = typeof item.toObject === 'function' ? item.toObject() : item;
  item_id = item_id.toString();

  item.votes = votes
    .filter(function (vote) {
      return vote.item.toString() === item_id;
    })
    .reduce(function (prev, curr, i) {

      // count this item as voted for if the logged in user has a vote tallied
      if(user && user.id && curr.voter.toString() === user.id.toString()) {
        item.votedFor = true;
      }

      return prev + curr.amount;
    }, 0);

  return item;
};

// all-in-one query
/**
 * Add a `votes` property to an Array of Objects based on their type, `id` property, and the current user
 * @param {String}            type       Type of item. Should be `news`, `comment`, or `issue`
 * @param {String}            idProperty Property of the object that defines it's id. For mongoose docs, this is `_id`
 * @param {Array | Object}    items      Array of objects (or a single object) that votes should be added to. This converts mongoose objects into plain objects.
 * @param {User}              user       A user object with an `id` property
 * @param {Function}          callback   Function to be evaluated with an error as the first parameter, and the modified objects as the second
 */
exports.addVotesFor = function (type, idProperty, items, user, callback) {

  var isArray;

  if(arguments.length === 2) {
    return function (items, user, callback) {
      return votesController.addVotesFor(type, idProperty, items, user, callback);
    };
  }

  wasArray = Array.isArray(items);

  // make a non-array argument behave as an array for now to simplify our dealing with it
  if(!wasArray) items = [items];

  votesController.retrieveVotesFor(type, items.map(function (item) {
    return item[idProperty];
  }), function (err, votes) {

    if(err) return callback(err);

    // add the votes to the objects themselves
    items = items.map(function (item) {
      return votesController.addVotesToItem(item, item[idProperty], user, votes);
    });

    // convert back if it wasn't passed in as an array
    if(!wasArray) items = items[0];

    callback(null, items);
  });
};
