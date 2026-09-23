import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    configFile: './vite.config.js',
    server: {
      port: 5173,
      host: '127.0.0.1'
    }
  });
  await server.listen();
  console.log('Vite server started at http://127.0.0.1:5173');
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
