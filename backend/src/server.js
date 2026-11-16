import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { convocationSyncService } from './services/convocation-sync-service.js';

const server = app.listen(env.PORT, () => {
  console.info(`SIPEC-MLA API disponible en el puerto ${env.PORT}.`);
  if (env.CONVOCATORIAS_API_URL) {
    const runSync = async () => {
      try {
        const result = await convocationSyncService.sync();
        console.info('Sincronización de convocatorias completada:', JSON.stringify(result));
      } catch (error) {
        console.error('Sincronización de convocatorias fallida:', error.message);
      }
    };
    runSync();
    const timer = setInterval(runSync, env.CONVOCATORIAS_SYNC_MINUTES * 60_000);
    timer.unref?.();
  }
});

async function shutdown(signal) {
  console.info(`Señal ${signal} recibida; cerrando la API.`);
  server.close(async (error) => {
    if (error) {
      console.error('Error al cerrar el servidor HTTP:', error);
      process.exitCode = 1;
    }
    await pool.end();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
