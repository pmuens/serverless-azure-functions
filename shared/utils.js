'use strict';

const constants = {
  type: 'type',
  direction: 'direction',
  trigger: 'Trigger',
  inDirection: 'in',
  outDirection: 'out',
  settings: 'settings',
  name: 'name',
  value: 'value',
  resource: 'resource',
  required: 'required',
  storage: 'storage',
  connection: 'connection',
  enum: 'enum',
  defaultValue: 'defaultValue',
  webHookType: 'webHookType',
  httpTrigger: 'httpTrigger',
  queue: 'queue',
  queueName: 'queueName',
  displayName: 'displayName',
  xAzureSettings: 'x-azure-settings',
  entryPoint: 'entryPoint'
};

module.exports = {
  getFunctionMetaData: function (functionName, parsedBindings, serverless) {
    var bindings = [];
    var bindingSettingsNames = [];
    var bindingSettings = [];
    var functionsJson = { 'disabled': false, 'bindings': [] };
    const functionObject = serverless.service.getFunction(functionName);
    var handler = functionObject.handler;
    var events = functionObject.events;
    const params = {};

    var bindingTypes = parsedBindings['bindingTypes'];
    var bindingDisplayNames = parsedBindings['bindingDisplayNames'];

    for (var eventsIndex = 0; eventsIndex < events.length; eventsIndex++) {
      var bindingType = Object.keys(functionObject.events[eventsIndex])[0];
      if (eventsIndex === 0) {
        bindingType = bindingType + constants.trigger;
      }

      var index = bindingTypes.indexOf(bindingType);
      if (index < 0) {
        throw new Error(`Binding  ${bindingType} not supported`);
      }

      serverless.cli.log(`Building binding for function: ${functionName} event: ${bindingType}`);

      var bindingUserSettings = {};
      var azureSettings = events[eventsIndex][constants.xAzureSettings];
      var bindingTypeIndex = bindingTypes.indexOf(bindingType);
      bindingTypeIndex = this.setBindingDirection(azureSettings, bindingType, bindingDisplayNames, bindingTypeIndex, bindingUserSettings);

      if (bindingType.includes(constants.queue) && functionObject.events[eventsIndex].queue) {
        bindingUserSettings[constants.queueName] = functionObject.events[eventsIndex].queue;
      }

      if (bindingTypeIndex < 0) {
        throw new Error('Binding not supported');
      }

      bindingSettings = parsedBindings['bindingSettings'][bindingTypeIndex];
      bindingSettingsNames = parsedBindings['bindingSettingsNames'][bindingTypeIndex];

      if (azureSettings) {
        for (var j = 0; j < Object.keys(azureSettings).length; j++) {
          var key = Object.keys(azureSettings)[j];
          if (bindingSettingsNames.indexOf(key) >= 0) {
            bindingUserSettings[key] = azureSettings[key];
          }
        }
      }

      bindings.push(this.getBinding(bindingType, bindingSettings, bindingUserSettings, serverless));
    }

    if (bindingType === constants.httpTrigger && bindings.length === 1) {
      bindings.push(this.getHttpOutBinding(bindingUserSettings));
    }

    functionsJson.bindings = bindings;
    params['functionsJson'] = functionsJson;

    var entryPointAndHandlerPath = this.getEntryPointAndHandlerPath(handler);
    const metaData = {
      'entryPoint': entryPointAndHandlerPath[constants.entryPoint],
      'handlerPath': entryPointAndHandlerPath['handlerPath'],
      'params': params
    };
    return metaData;
  },

  setBindingDirection: function (azureSettings, bindingType, bindingDisplayNames, bindingTypeIndex, bindingUserSettings) {
    if (azureSettings) {
      var directionIndex = Object.keys(azureSettings).indexOf(constants.direction);
      if (directionIndex >= 0) {
        var key = Object.keys(azureSettings)[directionIndex];
        var displayName = '$' + bindingType + azureSettings[key] + '_displayName';
        bindingTypeIndex = bindingDisplayNames.indexOf(displayName.toLowerCase());
        bindingUserSettings[constants.direction] = azureSettings[key];
      }
    }
    return bindingTypeIndex;
  },

  getEntryPointAndHandlerPath: function (handler) {
    var handlerPath = 'handler.js';
    var entryPoint = handler;
    var handlerSplit = handler.split('.');
    if (handlerSplit.length > 1) {
      entryPoint = handlerSplit[handlerSplit.length - 1];
      handlerPath = handler.substring(0, handler.lastIndexOf('.')) + '.js';
    }
    const metaData = {
      'entryPoint': entryPoint,
      'handlerPath': handlerPath
    };
    return metaData;
  },

  getHttpOutBinding: function (bindingUserSettings) {
    var binding = {};
    binding[constants.type] = 'http';
    binding[constants.direction] = constants.outDirection;
    binding[constants.name] = '$return';
    if (bindingUserSettings[constants.webHookType]) {
      binding[constants.name] = 'res';
    }
    return binding;
  },

  getBinding: function (bindingType, bindingSettings, bindingUserSettings, serverless) {
    var binding = {};
    binding[constants.type] = bindingType;
    if (bindingUserSettings && bindingUserSettings[constants.direction]) {
      binding[constants.direction] = bindingUserSettings[constants.direction];
    } else if (bindingType.includes(constants.trigger)) {
      binding[constants.direction] = constants.inDirection;
    } else {
      binding[constants.direction] = constants.outDirection;
    }

    for (var bindingSettingsIndex = 0; bindingSettingsIndex < bindingSettings.length; bindingSettingsIndex++) {
      var name = bindingSettings[bindingSettingsIndex][constants.name];
      if (bindingUserSettings && bindingUserSettings[name]) {
        binding[name] = bindingUserSettings[name];
        continue;
      }
      var value = bindingSettings[bindingSettingsIndex][constants.value];
      var required = bindingSettings[bindingSettingsIndex][constants.required];
      var resource = bindingSettings[bindingSettingsIndex][constants.resource];

      if (required) {
        var defaultValue = bindingSettings[bindingSettingsIndex][constants.defaultValue];
        if (defaultValue) {
          binding[name] = defaultValue;
        } else if (name === constants.connection && resource.toLowerCase() === constants.storage) {
          binding[name] = 'AzureWebJobsStorage';
        } else {
          throw new Error('Required property ' + name + ' is missing for binding:' + bindingType);
        }
      }

      if (value === constants.enum && name !== constants.webHookType) {
        var enumValues = bindingSettings[bindingSettingsIndex][constants.enum];
        binding[name] = enumValues[0][constants.value];
      }
    }
    return binding;
  }
};
