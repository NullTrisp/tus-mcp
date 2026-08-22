import * as z from 'zod/v4';

const hostnameSchema = z.string().trim().toLowerCase().refine((hostname) => {
    try {
        const url = new URL(`http://${hostname}`);
        return url.hostname === hostname && !url.port && url.pathname === '/';
    } catch {
        return false;
    }
}, 'Expected a hostname without a protocol, port, or path');

const httpsOriginSchema = z.string().trim().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/';
}, 'Expected an HTTPS origin without a path, query, or fragment');

const configSchema = z.object({
    port: z.coerce.number().int().min(1).max(65_535).default(3000),
    openaiAppsChallenge: z.string().trim().min(1).max(512).regex(/^[^\r\n]+$/).optional(),
    widgetDomain: httpsOriginSchema.optional(),
    allowedHosts: z.string()
        .default('localhost,127.0.0.1')
        .transform((value) => value.split(',').filter((host) => host.trim()))
        .pipe(z.array(hostnameSchema).min(1))
        .transform((hosts) => [...new Set(hosts)])
}).transform((config) => ({
    ...config,
    widgetDomain: config.widgetDomain ?? `https://${config.allowedHosts[0]}`
}));

export type RuntimeConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
    return configSchema.parse({
        port: env.PORT,
        ...(env.OPENAI_APPS_CHALLENGE && { openaiAppsChallenge: env.OPENAI_APPS_CHALLENGE }),
        ...(env.WIDGET_DOMAIN && { widgetDomain: env.WIDGET_DOMAIN }),
        allowedHosts: env.ALLOWED_HOSTS
    });
}
