// backend/src/middleware/reqValidator.js
// Phase 3 / D-09 / D-10
// Generic Zod validator. Mounts at route level:
//   router.post('/x', reqValidator(schemaX), handler)
// On failure throws AppError('VALIDATION_FAILED', 400) with err.issues = [{path, code, message}, ...].
// errorNormalizer (03-05) is responsible for serialising err.issues onto the response body.
//
// Acceptable sources: 'body' | 'query' | 'params'. Default is 'body'.
// On success: req.validated holds the parsed/coerced data; original req[source] is left intact.

const { AppError } = require('../errors/AppError');

function reqValidator(schema, source = 'body') {
  return (req, _res, next) => {
    const input = req[source];
    const result = schema.safeParse(input);
    if (!result.success) {
      const err = new AppError('VALIDATION_FAILED', 400);
      err.issues = result.error.issues.map((i) => ({
        path: i.path,
        code: i.code,
        message: i.message,
      }));
      return next(err);
    }
    req.validated = result.data;
    next();
  };
}

module.exports = { reqValidator };
