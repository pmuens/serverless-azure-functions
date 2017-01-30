'use strict';

const BbPromise = require('bluebird');
const utils = require('../../shared/utils');

module.exports = {
    createFunctions() {
        const createFunctionPromises = [];
        this.serverless.service.getAllFunctions().forEach((functionName) => {
            var metaData = utils.getFunctionMetaData(functionName, this.serverless);
            createFunctionPromises.push(this.provider.createZipObject(functionName, metaData["entryPoint"], metaData["handlerPath"], metaData["params"]));
        });

        return BbPromise.all(createFunctionPromises)
            .then(() => this.provider.createAndUploadZipFunctions());
    },
};
