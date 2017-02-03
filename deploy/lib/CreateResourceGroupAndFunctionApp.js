'use strict';

module.exports = {
  CreateResourceGroupAndFunctionApp () {
    const functionAppName = this.serverless.service.provider['functionAppName'];
    return this.provider.CreateResourceGroup()
      .then(() => this.provider.CreateFunctionApp());
  }
};
