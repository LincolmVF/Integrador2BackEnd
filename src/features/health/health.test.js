import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../app.js';

test('Prueba Funcional: GET /health debería retornar 200 OK', async () => {
    const response = await request(app).get('/health');

    assert.strictEqual(response.status, 200, 'El código de estado debe ser 200');

    assert.strictEqual(
        response.body.message,
        'Gema Academy API is running',
        'El mensaje de respuesta no coincide'
    );

    console.log("Fecha ISO de Testing: ", response.body.data.timestamp)
    assert.ok(response.body.data.timestamp, 'Debe existir un timestamp en la data');
});