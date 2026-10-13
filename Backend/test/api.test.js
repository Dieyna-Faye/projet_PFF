const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const models = require('../src/models');

async function startServer() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function apiJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  return { response, body };
}

test.before(async () => {
  await models.sequelize.sync({ force: true });
  await models.Role.bulkCreate([
    { name: 'admin', label: 'Administrateur', permissions: JSON.stringify(['*']) },
    { name: 'authority', label: 'Autorité contractante', permissions: JSON.stringify(['tenders:manage']) },
    { name: 'supplier', label: 'Fournisseur', permissions: JSON.stringify(['tenders:view']) },
    { name: 'commission', label: 'Commission', permissions: JSON.stringify(['evaluations:manage']) },
    { name: 'auditor', label: 'Auditeur', permissions: JSON.stringify(['audit:view']) },
  ]);
});

test('GET /health renvoie le statut ok', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { response, body } = await apiJson(baseUrl, '/health');
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
  } finally {
    server.close();
  }
});

test('POST /api/auth/register create un compte fournisseur', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const payload = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.com',
      password: 'MotDePasse123!',
      role: 'admin', // Public input must not be allowed to create privileged accounts.
      phone: '770000123',
      address: 'Dakar',
      companyName: 'Sarl Demo',
      activitySector: 'informatique',
      yearsExperience: 5,
    };

    const { response, body } = await apiJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 201, body.error || 'register failed');
    assert.equal(body.user.email, payload.email);
    assert.equal(body.user.role, 'supplier');
    assert.ok(body.token, 'token absent');
  } finally {
    server.close();
  }
});

test('POST /api/auth/login authentifie un utilisateur existant', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const email = 'bob@example.com';
    await models.User.create({
      firstName: 'Bob',
      lastName: 'Dupont',
      email,
      passwordHash: await require('../src/utils/security').hashPassword('MotDePasse123!'),
      roleId: (await models.Role.findOne({ where: { name: 'supplier' } })).id,
    });

    const { response, body } = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'MotDePasse123!' }),
    });

    assert.equal(response.status, 200, body.error || 'login failed');
    assert.equal(body.user.email, email);
    assert.ok(body.token, 'token absent');
  } finally {
    server.close();
  }
});

const cleanUp = async () => {
  await models.sequelize.close();
};

test.after(cleanUp);
