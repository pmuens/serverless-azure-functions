'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getAdminKey() {
    return this.provider.getAdminKey();
  },
};
