// Start localtunnel for port 9000
const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 9000 });
    console.log('TUNNEL_URL=' + tunnel.url);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });
    
    // Keep alive
    process.on('SIGINT', () => {
      tunnel.close();
      process.exit();
    });
  } catch(e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
