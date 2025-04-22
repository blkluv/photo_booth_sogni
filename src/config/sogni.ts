const SOGNI_HOSTS = {
  'local': { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
  'staging': { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
  'production': { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' },
} as const;

type SogniEnv = keyof typeof SOGNI_HOSTS;

const SOGNI_ENV = import.meta.env.VITE_SOGNI_ENV as SogniEnv || 'staging';

console.log('Config - SOGNI_ENV:', SOGNI_ENV);
console.log('Config - SOGNI_HOSTS[SOGNI_ENV]:', SOGNI_HOSTS[SOGNI_ENV]);

if (!SOGNI_HOSTS[SOGNI_ENV]) {
  throw new Error(`Invalid SOGNI_ENV: ${SOGNI_ENV}. Must be one of: ${Object.keys(SOGNI_HOSTS).join(', ')}`);
}

export const SOGNI_URLS = SOGNI_HOSTS[SOGNI_ENV];
console.log('Config - Exported SOGNI_URLS:', SOGNI_URLS); 