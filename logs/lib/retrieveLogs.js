'use strict'

module.exports = {
  retrieveLogs () {
    const func = this.options.function
    return this.provider.getLogsStream(func)
  }
}
