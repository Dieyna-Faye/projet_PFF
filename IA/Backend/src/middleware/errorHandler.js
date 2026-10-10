function errorHandler(err, req, res, next) {
  console.error('[ERREUR]', err.message);
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'Contrainte d\'unicite', details: err.errors.map((e) => e.message) });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: 'Validation echouee', details: err.errors.map((e) => e.message) });
  }
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop volumineux' });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Erreur interne du serveur' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Route introuvable' });
}

module.exports = { errorHandler, notFound };
