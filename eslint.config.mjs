import next from 'eslint-config-next';

const config = [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'data/**', 'attachments/**', 'secrets/**', 'tmp/**', 'next-env.d.ts'],
  },
  ...next,
  {
    rules: {
      // Data hooks intentionally use the fetch-then-setState pattern; this new
      // strict rule from react-hooks v7 flags it. Keep visible but non-fatal.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
