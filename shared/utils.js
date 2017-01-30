'use strict';

module.exports = {
  getFunctionMetaData: function(functionName, serverless) {
    serverless.cli.log('Packaging function : ' + functionName);
    const functionObject = serverless.service.getFunction(functionName);
    var handler = functionObject.handler;
    var entryPoint = handler;
    var handlerPath = "handler.js";
    var eventType = Object.keys(functionObject.events[0])[0];
    let event;
    const params = {
      "eventType": eventType
    };
    if (eventType == 'http') {
      params["authLevel"] = functionObject.events[0].authLevel;
    }
    if (eventType == 'queue') {
      params["queueName"] = functionObject.events[0].queue;
    }
    var arr = handler.split(".");
    if (arr.length > 1) {
      entryPoint = arr[arr.length - 1];
      handlerPath = handler.substring(0, handler.lastIndexOf('.')) + ".js";
    }
    const metaData = {
      "entryPoint" : entryPoint,
      "handlerPath" : handlerPath,
      "params": params,
    };
    return metaData;
  }
};
