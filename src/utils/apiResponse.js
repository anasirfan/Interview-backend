function sendSuccess(res, message, data = null, statusCode = 200, meta) {
  const payload = { success: true, message, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
}

function sendError(res, message, statusCode = 500, data = null) {
  const payload = { success: false, message, data };
  return res.status(statusCode).json(payload);
}

module.exports = { sendSuccess, sendError };
