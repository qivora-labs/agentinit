const { health } = require('./routes/health.js');
const { reportError } = require('./middleware/errors.js');

function createApp() {
  return {
    listen(_port) {
      // The HTTP server starts here.
    },
    health,
    reportError,
  };
}

createApp().listen(3000);

module.exports = { createApp };
