'use strict';
var path = require('path');

var bindingsJson = require(path.join(__dirname, 'bindings.json'));

const constants = {
  bindings: 'bindings',
  settings: 'settings',
  name: 'name',
  displayName: 'displayName',
  type: 'type'
};

module.exports = {
  getBindingsMetaData: function (serverless) {
    serverless.cli.log(`Parsing Azure Functions Bindings.json...`);
    var bindingDisplayNames = [];
    var bindingTypes = [];
    var bindingSettings = [];
    var bindingSettingsNames = [];
    for (var bindingsIndex = 0; bindingsIndex < bindingsJson[constants.bindings].length; bindingsIndex++) {
      var settingsNames = [];
      bindingTypes.push(bindingsJson[constants.bindings][bindingsIndex][constants.type]);
      bindingDisplayNames.push(bindingsJson[constants.bindings][bindingsIndex][constants.displayName].toLowerCase());
      bindingSettings[bindingsIndex] = bindingsJson[constants.bindings][bindingsIndex][constants.settings];
      for (var bindingSettingsIndex = 0; bindingSettingsIndex < bindingSettings[bindingsIndex].length; bindingSettingsIndex++) {
        settingsNames.push(bindingSettings[bindingsIndex][bindingSettingsIndex][constants.name]);
      }
      bindingSettingsNames[bindingsIndex] = settingsNames;
    }
    var parsedBindings = {
      'bindingDisplayNames': bindingDisplayNames,
      'bindingTypes': bindingTypes,
      'bindingSettings': bindingSettings,
      'bindingSettingsNames': bindingSettingsNames
    };
    return parsedBindings;
  }
};
