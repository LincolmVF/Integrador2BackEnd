import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../app.js';

test('Prueba BDD (Comportamiento): Flujo de login con credenciales inválidas', async () => {
    // DADO que un usuario intenta acceder con credenciales que no existen
    const payloadInvalido = {
        username: 'usuario_inexistente_gema',
        password: 'clave_equivocada_123'
    };

    // CUANDO el cliente envía la petición POST al endpoint de autenticación
    const response = await request(app)
        .post('/api/auth/login')
        .send(payloadInvalido);

    // ENTONCES el sistema debe rechazar la petición con un código de error (400, 401 o 404)
    assert.ok(
        [400, 401, 404].includes(response.status),
        `El servidor debería retornar un status de error de cliente, pero retornó ${response.status}`
    );

    // Y la respuesta no debe contener datos sensibles de sesión
    assert.ok(
        !response.body.data?.user,
        'No se debe retornar la información del usuario'
    );
});