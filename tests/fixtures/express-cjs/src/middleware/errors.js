function reportError(error) {
  return error instanceof Error ? error.message : 'error';
}

module.exports = { reportError };
