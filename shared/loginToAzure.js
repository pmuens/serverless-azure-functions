'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  loginToAzure() {
    const loginToAzurePromises = [];
        this.serverless.cli.log(`Logging in to Azure`);
     return this.provider.LoginWithServicePrincipal();
  },
};
