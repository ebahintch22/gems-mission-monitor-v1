const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) {
    return false;
  }

  return bcrypt.compare(password, hash);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 10;
}

module.exports = {
  hashPassword,
  validatePassword,
  verifyPassword
};
