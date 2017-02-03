'use strict';

const utils = require('../../shared/utils');

module.exports = {
  createFunction () {
    var functionName = this.options.function;
    var x = this.provider.getParsedBindings();
    console.log(x['bindingTypes']);
    var metaData = utils.getFunctionMetaData(functionName, this.provider.getParsedBindings(), this.serverless);
    return this.provider.createZipObject(functionName, metaData['entryPoint'], metaData['handlerPath'], metaData['params'])
      .then(() => this.provider.createAndUploadZipFunctions());
  }
};
