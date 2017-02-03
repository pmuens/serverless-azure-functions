'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
var msRestAzure = require('ms-rest-azure');
var resourceManagement = require('azure-arm-resource');
var path = require('path');
var fs = require('fs');
var fse = require('fs-extra');
var https = require('https');
var JSZip = require('jszip');
var request = require('request');
var dns = require('dns');
var parseBindings = require('../shared/parseBindings');

var resourceGroupName;
var deploymentName;
var functionAppName;
var subscriptionId;
var servicePrincipalTenantId;
var servicePrincipalClientId;
var servicePrincipalPassword;
var functionsAdminKey;
var invocationId;
var oldLogs = '';
var principalCredentials;
var functionsFolder;
var zipArray = [];
var deployedFunctionNames = [];
var existingFunctionApp = false;
var parsedBindings;

const constants = {
  providerName: 'azure',
  scmDomain: '.scm.azurewebsites.net',
  functionAppDomain: '.azurewebsites.net',
  masterKeyApiApth: '/api/functions/admin/masterkey',
  bearer: 'Bearer ',
  authorizationHeader: 'Authorization',
  contentTypeHeader: 'Content-Type',
  jsonContentType: 'application/json',
  functionsApiPath: '/api/functions',
  functionsAdminApiPath: '.azurewebsites.net/admin/functions/',
  logStreamApiPath: '/api/logstream/application/functions/function/',
  logInvocationsApiPath: '/azurejobs/api/functions/definitions/',
  logOutputApiPath: '/azurejobs/api/log/output/',
  functionAppApiPath: '/api/',
  scmVfsPath: '.scm.azurewebsites.net/api/vfs/site/wwwroot/',
  scmZipApiPath: '.scm.azurewebsites.net/api/zip/site/wwwroot/'
};

class AzureProvider {
  static getProviderName () {
    return constants.providerName;
  }

  constructor (serverless) {
    this.serverless = serverless;
    this.provider = this;
    this.serverless.setProvider(constants.providerName, this);
    subscriptionId = process.env[this.serverless.service.provider['subscriptionId']];
    servicePrincipalTenantId = process.env[this.serverless.service.provider['servicePrincipalTenantId']];
    servicePrincipalClientId = process.env[this.serverless.service.provider['servicePrincipalClientId']];
    servicePrincipalPassword = process.env[this.serverless.service.provider['servicePrincipalPassword']];

    functionAppName = this.serverless.service.service;
    resourceGroupName = functionAppName + '-rg';
    deploymentName = resourceGroupName + '-deployment';
    functionsFolder = path.join(this.serverless.config.servicePath, 'functions');
    this.parsedBindings = parseBindings.getBindingsMetaData(this.serverless);
  }

  getParsedBindings () {
    return this.parsedBindings;
  }

  LoginWithServicePrincipal () {
    return new BbPromise((resolve, reject) => {
      msRestAzure.loginWithServicePrincipalSecret(servicePrincipalClientId, servicePrincipalPassword, servicePrincipalTenantId, (error, credentials) => {
        if (error) {
          reject(error);
        } else {
          principalCredentials = credentials;
          resolve(credentials);
        }
      });
    });
  }

  CreateResourceGroup () {
    var groupParameters = { location: this.serverless.service.provider['location'], tags: { sampletag: 'sampleValue' } };
    this.serverless.cli.log(`Creating resource group: ${resourceGroupName}`);
    var resourceClient = new resourceManagement.ResourceManagementClient(principalCredentials, subscriptionId);
    return new BbPromise((resolve, reject) => {
      resourceClient.resourceGroups.createOrUpdate(resourceGroupName,
        groupParameters, (error, result, request, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
    });
  }

  CreateFunctionApp (method, params) {
    this.serverless.cli.log(`Creating function app: ${functionAppName}`);
    var resourceClient = new resourceManagement.ResourceManagementClient(principalCredentials, subscriptionId);
    var parameters = {
      'functionAppName': {
        'value': functionAppName
      }
    };

    var gitUrl = this.serverless.service.provider['gitUrl'];
    if (gitUrl) {
      parameters = {
        'functionAppName': {
          'value': functionAppName
        },
        'gitUrl': {
          'value': gitUrl
        }
      };
    }

    var templateFilePath = path.join(__dirname, 'armTemplates', 'azuredeploy.json');
    if (gitUrl) {
      templateFilePath = path.join(__dirname, 'armTemplates', 'azuredeployWithGit.json');
    }
    if (this.serverless.service.provider['armTemplate']) {
      templateFilePath = path.join(this.serverless.config.servicePath, this.serverless.service.provider['armTemplate']['file']);
      var userParameters = this.serverless.service.provider['armTemplate']['parameters'];
      var userParametersKeys = Object.keys(userParameters);
      for (var paramIndex = 0; paramIndex < userParametersKeys.length; paramIndex++) {
        var item = {};
        item[userParametersKeys[paramIndex]] = { 'value': userParameters[userParametersKeys[paramIndex]] };
        parameters = _.merge(parameters, item);
      }
    }

    var template = JSON.parse(fs.readFileSync(templateFilePath, 'utf8'));
    var deploymentParameters = {
      'properties': {
        'parameters': parameters,
        'template': template,
        'mode': 'Incremental'
      }
    };
    return new BbPromise((resolve, reject) => {
      resourceClient.deployments.createOrUpdate(resourceGroupName,
        deploymentName,
        deploymentParameters, (error, result, request, response) => {
          if (error) {
            reject(error);
          } else {
            this.serverless.cli.log(`Waiting for Kudu endpoint...`);
            setTimeout(function () {
              resolve(result);
            }, 10000);
          }
        });
    });
  }

  DeleteDeployment () {
    this.serverless.cli.log(`Deleting deployment: ${deploymentName}`);
    var resourceClient = new resourceManagement.ResourceManagementClient(principalCredentials, subscriptionId);
    return new BbPromise((resolve, reject) => {
      resourceClient.deployments.deleteMethod(resourceGroupName,
        deploymentName, (error, result, request, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
    });
  }

  DeleteResourceGroup () {
    this.serverless.cli.log(`Deleting resource group: ${resourceGroupName}`);
    var resourceClient = new resourceManagement.ResourceManagementClient(principalCredentials, subscriptionId);
    return new BbPromise((resolve, reject) => {
      resourceClient.resourceGroups.deleteMethod(resourceGroupName, (error, result, request, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  getAdminKey () {
    var options = {
      host: functionAppName + constants.scmDomain,
      port: 443,
      path: constants.masterKeyApiApth,
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Content-Type': constants.jsonContentType
      }
    };

    return new BbPromise((resolve, reject) => {
      https.get(options, (res) => {
        var body = '';
        res.on('data', function (data) {
          body += data;
        });
        res.on('end', function () {
          var parsed = JSON.parse(body);
          functionsAdminKey = parsed['masterKey'];
          resolve(res);
        });
        res.on('error', function (e) {
          reject(e);
        });
      });
    });
  }

  isExistingFunctionApp () {
    var host = functionAppName + constants.scmDomain;
    return new BbPromise((resolve, reject) => {
      dns.resolve4(host, (err, addresses) => {
        if (err) {
          if (err.message.includes('ENOTFOUND')) {
            resolve(existingFunctionApp);
          } else {
            reject(err);
          }
        } else {
          existingFunctionApp = true;
          resolve(existingFunctionApp);
        }
      });
    });
  }

  getDeployedFunctionsNames () {
    var requestUrl = 'https://' + functionAppName + constants.scmDomain + constants.functionsApiPath;
    var options = {
      host: functionAppName + constants.scmDomain,
      method: 'get',
      url: requestUrl,
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Accept': 'application/json,*/*'
      }
    };
    return new BbPromise((resolve, reject) => {
      if (existingFunctionApp) {
        this.serverless.cli.log(`Looking for deployed functions that are not part of the current deployment...`);
        request(options, (err, res, body) => {
          if (err) {
            if (err.message.includes('ENOTFOUND')) {
              resolve(res);
            } else {
              reject(err);
            }
          } else {
            if (res.statusCode === 200) {
              var parsed = JSON.parse(body);
              for (var i = 0; i < parsed.length; i++) {
                deployedFunctionNames.push(parsed[i].name);
              }
            }
            resolve(res);
          }
        });
      } else {
        resolve('New service...');
      }
    });
  }

  getLogsStream (functionName) {
    var logOptions = {
      host: functionAppName + constants.scmDomain,
      port: 443,
      path: constants.logStreamApiPath + functionName,
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Accept': '*/*'
      }
    };

    https.get(logOptions, function (res) {
      var body = '';
      res.on('data', function (data) {
        body += data;
        var currentLogs = body.substring(oldLogs.length, body.length - 1);
        console.log(currentLogs);
        oldLogs = oldLogs + currentLogs;
      });
      res.on('end', function () {
        console.log(body);
        this.getLogsStream(functionName);
      });
      res.on('error', function (e) {
        console.log('Got error: ' + e.message);
      });
    });
  }

  getInvocationId (functionName) {
    var options = {
      host: functionAppName + constants.scmDomain,
      port: 443,
      path: constants.logInvocationsApiPath + functionAppName + '-' + functionName + '/invocations?limit=5',
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Content-Type': constants.jsonContentType
      }
    };
    return new BbPromise((resolve, reject) => {
      https.get(options, (res) => {
        var body = '';
        res.on('data', function (data) {
          body += data;
        });
        res.on('end', function () {
          var parsed = JSON.parse(body);
          invocationId = parsed['entries'][0]['id'];
          resolve(res);
        });
        res.on('error', function (e) {
          reject(e);
        });
      });
    });
  }

  getLogsForInvocationId () {
    this.serverless.cli.log(`Logs for InvocationId: ${invocationId}`);
    var options = {
      host: functionAppName + constants.scmDomain,
      port: 443,
      path: constants.logOutputApiPath + invocationId,
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Content-Type': constants.jsonContentType
      }
    };
    return new BbPromise((resolve, reject) => {
      https.get(options, (res) => {
        var body = '';
        res.on('data', function (data) {
          body += data;
        });
        res.on('end', function () {
          console.log(body);
        });
        res.on('error', function (e) {
          reject(e);
        });
        resolve(res);
      });
    });
  }

  invoke (functionName, eventType, eventData) {
    var options = {};
    if (eventType === 'http') {
      var queryString = '';
      if (eventData) {
        Object.keys(eventData).forEach(key => {
          var value = eventData[key];
          queryString = key + '=' + value;
        });
      }
      options = {
        host: functionAppName + constants.functionAppDomain,
        port: 443,
        path: constants.functionAppApiPath + functionName + '?' + queryString
      };
      return new BbPromise((resolve, reject) => {
        https.get(options, (res) => {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            console.log(body);
          });
          res.on('error', function (e) {
            reject(e);
          });
          resolve(res);
        });
      });
    } else {
      var requestUrl = 'https://' + functionAppName + constants.functionsAdminApiPath + functionName;
      console.log(eventData);
      options = {
        host: constants.functionAppDomain,
        method: 'post',
        body: eventData,
        url: requestUrl,
        json: true,
        headers: {
          'x-functions-key': functionsAdminKey,
          'Accept': 'application/json,*/*'
        }
      };
      return new BbPromise((resolve, reject) => {
        request(options, (err, res, body) => {
          if (err) {
            reject(err);
          }
          this.serverless.cli.log(`Invoked function at: ${requestUrl}. \nResponse statuscode: ${res.statusCode}`);
          resolve(res);
        });
      });
    }
  }

  cleanUpFunctionsBeforeDeploy (serverlessFunctions) {
    const deleteFunctionPromises = [];
    deployedFunctionNames.forEach((functionName) => {
      if (serverlessFunctions.indexOf(functionName) < 0) {
        this.serverless.cli.log(`Deleting function : ${functionName}`);
        deleteFunctionPromises.push(this.deleteFunction(functionName));
      }
    });
    return BbPromise.all(deleteFunctionPromises);
  }

  deleteFunction (functionName) {
    var requestUrl = 'https://' + functionAppName + constants.scmVfsPath + functionName + '/?recursive=true';
    var options = {
      host: functionAppName + constants.scmDomain,
      method: 'delete',
      url: requestUrl,
      headers: {
        'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
        'Accept': '*/*',
        'Content-Type': constants.jsonContentType
      }
    };
    return new BbPromise((resolve, reject) => {
      request(options, (err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  createZipObject (functionName, entryPoint, filePath, params) {
    return new BbPromise((resolve, reject) => {
      this.serverless.cli.log(`Packaging function: ${functionName}`);
      var folderForJSFunction = path.join(functionsFolder, functionName);
      var handlerPath = path.join(this.serverless.config.servicePath, filePath);
      if (!fs.existsSync(folderForJSFunction)) {
        fs.mkdirSync(folderForJSFunction);
      }
      fse.copySync(handlerPath, path.join(folderForJSFunction, 'index.js'));
      var functionJSON = params['functionsJson'];
      functionJSON['entryPoint'] = entryPoint;
      fs.writeFileSync(path.join(folderForJSFunction, 'function.json'), JSON.stringify(functionJSON, null, 4));
      fs.readdirSync(functionsFolder).filter(function (folder) {
        var folderName = path.basename(folder);
        if (fs.statSync(path.join(functionsFolder, folder)).isDirectory() && (functionName == folderName)) {
          var zip = new JSZip();
          fs.readdir(path.join(functionsFolder, folder), (err, files) => {
            if (err) {
              reject(err);
            } else {
              var filesInFolder = 0;
              for (var i = 0; i < files.length; i++) {
                var filepathtobezipped = path.join(functionsFolder, folder, files[i]);
                var data = fs.readFileSync(filepathtobezipped);
                filesInFolder++;
                zip.folder(path.basename(folder)).folder(path.basename(folder)).file(path.basename(filepathtobezipped), data);
                if (filesInFolder === files.length) {
                  zipArray.push({
                    key: path.basename(folder),
                    value: zip
                  });
                  resolve('done folder..' + folder);
                }
              }
            }
          });
        }
      });
    });
  }

  createZipFileAndUploadFunction (folder, zip) {
    return new BbPromise((resolve, reject) => {
      var generateOptions = {
        type: 'nodebuffer',
        streamFiles: true
      };
      var zipFileName = path.basename(folder) + '.zip';
      var outputZipPath = path.join(functionsFolder, zipFileName);
      zip.folder(path.basename(folder)).generateNodeStream(generateOptions)
        .pipe(fs.createWriteStream(outputZipPath))
        .on('error', function (error) {
          reject(error);
        })
        .on('finish', function () {
          var requestUrl = 'https://' + functionAppName + constants.scmZipApiPath;
          var options = {
            url: requestUrl,
            headers: {
              'Authorization': constants.bearer + principalCredentials['tokenCache']['_entries'][0]['accessToken'],
              'Accept': '*/*'
            }
          };

          fs.createReadStream(outputZipPath)
            .pipe(request.put(options, function (err, res, body) {
              if (err) {
                reject(err);
              } else {
                resolve('ZipFileCreated and uploaded');
              }
              fse.removeSync(outputZipPath);
            }));
        });
    });
  }

  createAndUploadZipFunctions () {
    var zipFunctions = [];
    for (var j = 0; j < zipArray.length; j++) {
      zipFunctions.push(this.createZipFileAndUploadFunction(zipArray[j].key, zipArray[j].value));
    }
    return BbPromise.all(zipFunctions);
  }
}
module.exports = AzureProvider;
