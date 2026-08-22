import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod/v4';
import { loadConfig } from './config.js';

test('validates and normalizes runtime configuration', () => {
    assert.deepEqual(loadConfig({}), {
        port: 3000,
        allowedHosts: ['localhost', '127.0.0.1']
    });
    assert.deepEqual(loadConfig({
        PORT: '443',
        OPENAI_APPS_CHALLENGE: '  challenge-value  ',
        ALLOWED_HOSTS: 'localhost, Api.Example.com,localhost'
    }), {
        port: 443,
        openaiAppsChallenge: 'challenge-value',
        allowedHosts: ['localhost', 'api.example.com']
    });

    for (const env of [
        { PORT: '0' },
        { PORT: '65536' },
        { PORT: 'invalid' },
        { OPENAI_APPS_CHALLENGE: '\n' },
        { ALLOWED_HOSTS: ' , ' },
        { ALLOWED_HOSTS: 'https://api.example.com' },
        { ALLOWED_HOSTS: 'api.example.com:443' }
    ]) {
        assert.throws(() => loadConfig(env), ZodError);
    }
});
