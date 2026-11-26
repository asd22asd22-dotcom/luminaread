import { startServer } from './app.js';

const port = Number(process.env.PORT || 3456);
const openBrowser = process.argv.includes('--open');

startServer({ port, host: '127.0.0.1', openBrowser }).catch((err) => {
  console.error('LuminaRead failed to start:', err.message);
  process.exit(1);
});
