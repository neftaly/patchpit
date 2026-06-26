import react from '@vitejs/plugin-react';

const appBase = process.env.BASE_PATH ?? '/';

const failOnRollupWarning = (warning: string | { readonly message?: string }): never => {
  const message = typeof warning === 'string' ? warning : warning.message ?? JSON.stringify(warning);
  throw new Error(`Rollup warning treated as error: ${message}`);
};

export default {
  base: appBase,
  clearScreen: false,
  plugins: [react()],
  build: {
    sourcemap: true,
    rollupOptions: {
      onwarn: failOnRollupWarning
    }
  }
};
