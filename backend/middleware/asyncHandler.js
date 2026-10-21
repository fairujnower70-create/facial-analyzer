// Express 4 does not catch errors thrown inside async route handlers.
// Wrapping a handler with this sends any error to the central error handler
// in server.js (which replies with a JSON 500) instead of hanging the request.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
