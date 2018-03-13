const Joi = require('joi');

const callValidator = (validator, values, path, options, errors) => {
  return validator(values[path], options)
    .then(newValue => {
      values[path] = newValue;
    })
    .catch(err => {
      if (err.name !== 'ValidationError') { // A real error happened
        return values;
      }

      errors.details.push({
        path: path,
        message: err.message,
        type: err.type,
        data: err.data,
      });

      if (options.abortEarly) {
        return err;
      }
    });
}

const asyncValidation = (joiSchema, customSchema) => {
  const validationFunction = async (values, options) => {
    const schema = Joi.object().keys(joiSchema);
    options.context.values = values;

    return Joi.validate(values, schema, options, (errors, values) => {
      if (errors && options.abortEarly) {
        return errors;
      } else if (! errors) {
        errors = new Error();
        errors.details = [];
      }

      const promises = Object.keys(customSchema).reduce((accumulator, path) => {
        if (! values[path]) {
          return accumulator;
        }

        if (Array.isArray(customSchema[path])) {
          customSchema[path].forEach(validator => {
            accumulator.push(callValidator(validator, values, path, options, errors))
          });
        } else {
          accumulator.push(callValidator(customSchema[path], values, path, options, errors));
        }
        return accumulator;
      }, []);

      return Promise.all(promises)
        .then(() => {
          if (errors.details.length) {
            return errors;
          } else {
            return values;
          }
        })
        .catch((err) => {
          return err;
        });
    });
  };

  validationFunction.joiSchema = joiSchema;
  return validationFunction;
};

// Mix JOI validation with our own custom validators
const oldFunc = (joiSchema, customSchema) => {
  const validationFunction = (values, options, next) => {
    const schema = Joi.object().keys(joiSchema);
    options.context.values = values;

    return Joi.validate(values, schema, options, (errors, values) => {
      if (errors && options.abortEarly) {
        next(errors, values);
      } else if (! errors) {
        errors = new Error();
        errors.details = [];
      }

      const promises = Object.keys(customSchema).reduce((accumulator, path) => {
        if (! values[path]) {
          return accumulator;
        }

        if (Array.isArray(customSchema[path])) {
          customSchema[path].forEach(validator => {
            accumulator.push(callValidator(validator, values, path, options, errors, next))
          });
        } else {
          accumulator.push(callValidator(customSchema[path], values, path, options, errors, next));
        }
        return accumulator;
      }, []);

      return Promise.all(promises)
        .then(() => {
          if (errors.details.length) {
            next(errors, values);
          } else {
            next(null, values);
          }
        })
        .catch((err) => {
          next(err, values);
        });
    });
  };

  validationFunction.joiSchema = joiSchema;
  return validationFunction;
};

module.exports = asyncValidation;
