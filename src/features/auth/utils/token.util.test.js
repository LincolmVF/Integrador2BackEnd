import test from 'node:test';
import assert from 'node:assert';
import { tokenUtils } from './token.util.js';

test('Prueba Unitaria: generateRefreshToken debería generar un string hexadecimal de 64 caracteres', () => {
    const token = tokenUtils.generateRefreshToken();

    assert.strictEqual(typeof token, 'string', 'El token generado debe ser una cadena de texto');

    assert.strictEqual(token.length, 64, 'El token debe tener exactamente 64 caracteres');

    assert.match(token, /^[0-9a-f]+$/i, 'El token debe contener únicamente formato hexadecimal');
});

test('Prueba Unitaria: isTokenExpired debería identificar correctamente un token expirado', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const isExpired = tokenUtils.isTokenExpired(pastDate);

    assert.strictEqual(isExpired, true, 'La función debe retornar true para fechas pasadas');
});