'use strict';

const express = require('express');
const Op = require('sequelize').Op;
const logger = require('heroku-logger');

const BadRequest = require('./BadRequest');
const db = require('../../db');
const graph = require('../../graph');

const router = express.Router();

router.route('/callback')
  .post((req, res, next) => {
    if (req.body.object !== 'page') {
      logger.warn('Received invalid page webhook', req.body);
      throw new BadRequest('Invalid topic.');
    }
    res.status(200).send();
    const mentionHandles = req.body.entry
      .map(entry => entry.changes)
      .reduce((acc, val) => acc.concat(val), [])
      .filter(change => change.field === 'mention')
      .map(change => change.value)
      .filter(value => value.verb === 'add')
      .map(handleMention);
    Promise
      .all(mentionHandles)
      .then();
  });

function handleMention(value) {
  const communityId = parseInt(value.community.id);
  db.models.community.findById(communityId)
    .then(community => {
      if (community === null) {
        throw new BadRequest(`Could not find community for mention webhook: ${communityId}`);
      }

      db.models.user.findOne({where: {workplaceID: value.from.id}})
        .then(user => {
          if (!user) {
            return reply(community, value, 'Whoops, I do not know who to assign this task to.');
          }
          const message = value.message.replace('Taaskly', '').trim();
          return db.models.task
            .create({
              title: value.message.replace('Taaskly', '').trim(),
              ownerId: user.id,
            })
            .then(task => {
              return reply(community, value, `Created a task: ${process.env.BASE_URL}task/${task.id}`);
            });
        })
    })
    .catch(err => {
      logger.error(err.message);
    })
}

function reply(community, value, message) {
  if (value.item === 'comment') {
    return graph(value.comment_id)
      .token(community.accessToken)
      .qs({fields: 'parent{id}'})
      .send()
      .then(response => {
        if (response.parent) {
          return graph(`${response.parent.id}/comments`)
            .token(community.accessToken)
            .body({message: message})
            .post()
            .send();
        } else {
          return graph(`${value.comment_id}/comments`)
            .token(community.accessToken)
            .body({message: message})
            .post()
            .send();
        }
      });
  }

  return graph(`${value.post_id}/comments`)
    .token(community.accessToken)
    .body({message: message})
    .post()
    .send();
}

module.exports = router;
