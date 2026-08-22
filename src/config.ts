import * as z from 'zod/v4';

const hostnameSchema = z.string().trim().toLowerCase().refine((hostname) => {
    try {
        const url = new URL(`http://${hostname}`);
        return url.hostname === hostname && !url.port && url.pathname === '/';
    } catch {
        return false;
    }
}, 'Expected a hostname without a protocol, port, or path');

const configSchema = z.object({
    port: z.coerce.number().int().min(1).max(65_535).default(3000),
    openaiAppsChallenge: z.string().trim().min(1).max(512).regex(/^[^\r\n]+$/).optional(),
    allowedHosts: z.string()
        .default('localhost,127.0.0.1')
        .transform((value) => value.split(',').filter((host) => host.trim()))
        .pipe(z.array(hostnameSchema).min(1))
        .transform((hosts) => [...new Set(hosts)])
});

export type RuntimeConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
    return configSchema.parse({
        port: env.PORT,
        ...(env.OPENAI_APPS_CHALLENGE && { openaiAppsChallenge: env.OPENAI_APPS_CHALLENGE }),
        allowedHosts: env.ALLOWED_HOSTS
    });
}
