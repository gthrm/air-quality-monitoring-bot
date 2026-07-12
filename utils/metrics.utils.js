const http = require('http');
const client = require('prom-client');
const { logger } = require('./logger.utils');
require('dotenv').config();

// Prometheus-метрики бота. Отдаются на GET /metrics за Bearer-токеном —
// тот же паттерн, что у остальных приложений на устройстве (см. job "wishlist"
// в prometheus.yml). Алерты («стик недоступен» и т.п.) собирает Grafana по
// этим метрикам, поэтому сам бот больше не шлёт ошибки в Telegram напрямую.

const register = new client.Registry();
// Лейбл app навешивает сам Prometheus из target-конфига (job "air-quality"),
// поэтому дефолтный здесь не задаём — иначе получаем дубль exported_app.
client.collectDefaultMetrics({ register });

const stickUp = new client.Gauge({
  name: 'air_bot_stick_up',
  help: 'M5StickC reachable (1) or not (0)',
  registers: [register],
});

const thingspeakUp = new client.Gauge({
  name: 'air_bot_thingspeak_up',
  help: 'Last ThingSpeak fetch succeeded (1) or failed (0)',
  registers: [register],
});

const stickFetchErrors = new client.Counter({
  name: 'air_bot_stick_fetch_errors_total',
  help: 'Total failed requests to the M5StickC',
  registers: [register],
});

const thingspeakFetchErrors = new client.Counter({
  name: 'air_bot_thingspeak_fetch_errors_total',
  help: 'Total failed requests to ThingSpeak',
  registers: [register],
});

const temperature = new client.Gauge({
  name: 'air_bot_temperature_celsius',
  help: 'Latest temperature reading',
  registers: [register],
});

const airPollution = new client.Gauge({
  name: 'air_bot_air_pollution',
  help: 'Latest air pollution reading (field3)',
  registers: [register],
});

const acState = new client.Gauge({
  name: 'air_bot_ac_state',
  help: 'AC believed on (1) or off (0)',
  registers: [register],
});

const lastPollSuccess = new client.Gauge({
  name: 'air_bot_last_poll_success_timestamp_seconds',
  help: 'Unix time of the last successful ThingSpeak poll',
  registers: [register],
});

function startMetricsServer() {
  const port = parseInt(process.env.METRICS_PORT, 10) || 3003;
  const token = process.env.METRICS_TOKEN;

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    try {
      const body = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(body);
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });

  // Слушаем на всех интерфейсах: Prometheus ходит из контейнера через
  // host.docker.internal (docker-bridge, не loopback). Порт защищён Bearer-
  // токеном — тот же паттерн, что у остального стека (job "wishlist").
  server.listen(port, '0.0.0.0', () => {
    logger.info(`Metrics server listening on 0.0.0.0:${port}/metrics`);
  });

  return server;
}

module.exports = {
  startMetricsServer,
  metrics: {
    stickUp,
    thingspeakUp,
    stickFetchErrors,
    thingspeakFetchErrors,
    temperature,
    airPollution,
    acState,
    lastPollSuccess,
  },
};
