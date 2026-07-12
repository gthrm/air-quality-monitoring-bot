require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { logger } = require('./utils/logger.utils');
const { startMetricsServer, metrics } = require('./utils/metrics.utils');

const {
  THINGSPEAK_API_KEY,
  THINGSPEAK_CHANNEL_ID,
  TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID,
  AIR_QUALITY_THRESHOLD,
  AIR_QUALITY_NIGHT_THRESHOLD,
  TEMPERATURE_THRESHOLD,
  AC_TEMPERATURE_THRESHOLD,
  AC_TEMPERATURE_RESTORE,
  AC_RETRY_MINUTES,
  M5_STICK_IP,
  CRON_EXPRESSION,
} = process.env;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const AC_RETRY_MS = (parseFloat(AC_RETRY_MINUTES) || 10) * 60 * 1000;

let lastAirPollution = 0;
let lastTemperature = 0;
let wasPollutionAlertSent = false;
let wasTemperatureAlertSent = false;

// Когда и при какой температуре последний раз слали "on"/"off" — чтобы понять,
// действительно ли кондиционер отреагировал, или ИК-команда не долетела.
let acOnSentAt = null;
let acOnAtTemp = null;
let acOffSentAt = null;
let acOffAtTemp = null;

function isNight() {
  const currentHour = new Date().getHours();
  return currentHour >= 0 && currentHour < 8;
}

// ── AC Control ─────────────────────────────────────────────────────────────
// Реальное состояние AC всегда запрашивается со стика (GET /status), а не
// хранится в памяти бота — так бот не теряет синхронизацию с устройством
// после рестарта, ручного нажатия кнопки на стике или неудачной IR-команды.

async function getStickACState() {
  if (!M5_STICK_IP) return null;
  try {
    const response = await axios.get(`http://${M5_STICK_IP}/status`, { timeout: 5000 });
    metrics.stickUp.set(1);
    const isOn = response.data.ac === 'on';
    metrics.acState.set(isOn ? 1 : 0);
    return isOn;
  } catch (error) {
    metrics.stickUp.set(0);
    metrics.stickFetchErrors.inc();
    logger.error('Failed to fetch AC status from stick:', error.message);
    return null;
  }
}

async function sendTemperatureToStick(current, threshold) {
  if (!M5_STICK_IP) return;
  try {
    await axios.get(`http://${M5_STICK_IP}/temperature`, {
      params: { current, threshold: Number.isNaN(threshold) ? undefined : threshold },
      timeout: 5000,
    });
    metrics.stickUp.set(1);
  } catch (error) {
    metrics.stickUp.set(0);
    metrics.stickFetchErrors.inc();
    logger.error('Failed to send temperature to stick:', error.message);
  }
}

async function turnACOn(temperature) {
  const isOn = await getStickACState();
  if (isOn === null) return; // стик недоступен — не гадаем

  if (isOn === true) {
    if (acOnSentAt === null) {
      // Стик уже считает AC включённым (например, до рестарта бота) — просто
      // запоминаем точку отсчёта, чтобы было с чем сравнивать дальше.
      acOnSentAt = Date.now();
      acOnAtTemp = temperature;
      return;
    }

    const stale = Date.now() - acOnSentAt > AC_RETRY_MS;
    const notCooling = temperature >= acOnAtTemp;
    if (!(stale && notCooling)) return;

    logger.info(`AC believed ON but temperature isn't dropping (${acOnAtTemp}°C → ${temperature}°C) — resending ON`);
  }

  try {
    await axios.get(`http://${M5_STICK_IP}/ac/on`, { timeout: 5000 });
    acOnSentAt = Date.now();
    acOnAtTemp = temperature;
    acOffSentAt = null;
    acOffAtTemp = null;
    metrics.acState.set(1);
    logger.info('AC command sent: on');
    await bot.sendMessage(TELEGRAM_CHAT_ID, `🌡️ Температура ${temperature}°C — кондиционер включён автоматически`);
  } catch (error) {
    logger.error('Failed to turn AC on:', error.message);
  }
}

async function turnACOff(temperature) {
  const isOn = await getStickACState();
  if (isOn === null) return; // стик недоступен — не гадаем

  if (isOn === false) {
    if (acOffSentAt === null) {
      // Стик уже считает AC выключенным (например, до рестарта бота) — просто
      // запоминаем точку отсчёта, чтобы было с чем сравнивать дальше.
      acOffSentAt = Date.now();
      acOffAtTemp = temperature;
      return;
    }

    const stale = Date.now() - acOffSentAt > AC_RETRY_MS;
    const stillCooling = temperature <= acOffAtTemp;
    if (!(stale && stillCooling)) return;

    logger.info(`AC believed OFF but temperature keeps dropping (${acOffAtTemp}°C → ${temperature}°C) — resending OFF`);
  }

  try {
    await axios.get(`http://${M5_STICK_IP}/ac/off`, { timeout: 5000 });
    acOffSentAt = Date.now();
    acOffAtTemp = temperature;
    acOnSentAt = null;
    acOnAtTemp = null;
    metrics.acState.set(0);
    logger.info('AC command sent: off');
    await bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Температура ${temperature}°C — кондиционер выключен`);
  } catch (error) {
    logger.error('Failed to turn AC off:', error.message);
  }
}

// ── Air quality + temperature processing ────────────────────────────────────

function checkPollution(airPollution) {
  metrics.airPollution.set(airPollution);
  const airQualityThreshold = isNight() ? AIR_QUALITY_NIGHT_THRESHOLD : AIR_QUALITY_THRESHOLD;

  if (airPollution > airQualityThreshold) {
    const message = `⚠️ Attention! Air pollution index exceeded: ${airPollution} 😷`;
    if (!wasPollutionAlertSent || airPollution > lastAirPollution) {
      bot.sendMessage(TELEGRAM_CHAT_ID, message);
      wasPollutionAlertSent = true;
    }
    logger.info(`Notification sent: ${message}`);
  } else {
    if (wasPollutionAlertSent) {
      const message = `✅ Air quality has normalized: ${airPollution}`;
      bot.sendMessage(TELEGRAM_CHAT_ID, message);
      logger.info(`Notification sent: ${message}`);
      wasPollutionAlertSent = false;
    }
    logger.info(`Air quality is normal: ${airPollution}`);
  }
  lastAirPollution = airPollution;
}

async function checkTemperature(temperature) {
  metrics.temperature.set(temperature);
  if (temperature > TEMPERATURE_THRESHOLD) {
    const message = `⚠️ Attention! Temperature exceeded: ${temperature} °C 🥵`;
    if (!wasTemperatureAlertSent || temperature > lastTemperature) {
      await bot.sendMessage(TELEGRAM_CHAT_ID, message);
      wasTemperatureAlertSent = true;
    }
    logger.info(`Notification sent: ${message}`);
  } else {
    if (wasTemperatureAlertSent) {
      const message = `✅ Temperature has normalized: ${temperature}`;
      await bot.sendMessage(TELEGRAM_CHAT_ID, message);
      logger.info(`Notification sent: ${message}`);
      wasTemperatureAlertSent = false;
    }
    logger.info(`Temperature is normal: ${temperature}`);
  }

  // AC управление через M5StickC
  const acOnThreshold = parseFloat(AC_TEMPERATURE_THRESHOLD);
  // Гистерезис 2°C: включаем при +threshold, выключаем при -restore (или threshold-2)
  const acOffThreshold = parseFloat(AC_TEMPERATURE_RESTORE || acOnThreshold - 2);

  await sendTemperatureToStick(temperature, acOnThreshold);

  if (!Number.isNaN(acOnThreshold) && M5_STICK_IP) {
    if (temperature >= acOnThreshold) {
      await turnACOn(temperature);
    } else if (temperature <= acOffThreshold) {
      await turnACOff(temperature);
    }
  }

  lastTemperature = temperature;
}

// ── ThingSpeak polling ───────────────────────────────────────────────────────

async function checkThingSpeak() {
  try {
    const response = await axios.get(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`, {
      params: {
        api_key: THINGSPEAK_API_KEY,
        results: 1,
      },
    });

    metrics.thingspeakUp.set(1);
    metrics.lastPollSuccess.set(Date.now() / 1000);

    const { feeds } = response.data;
    if (feeds.length > 0) {
      const latestEntry = feeds[0];
      checkPollution(parseFloat(latestEntry.field3));
      await checkTemperature(parseFloat(latestEntry.field1));
    }
  } catch (error) {
    metrics.thingspeakUp.set(0);
    metrics.thingspeakFetchErrors.inc();
    logger.error('Error fetching data from ThingSpeak:', error);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

startMetricsServer();
checkThingSpeak();

cron.schedule(CRON_EXPRESSION, checkThingSpeak);
