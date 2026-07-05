require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { logger } = require('./utils/logger.utils');

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
  M5_STICK_IP,
  CRON_EXPRESSION,
} = process.env;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let lastAirPollution = 0;
let lastTemperature = 0;
let wasPollutionAlertSent = false;
let wasTemperatureAlertSent = false;
let isAcOn = false;

function isNight() {
  const currentHour = new Date().getHours();
  return currentHour >= 0 && currentHour < 8;
}

// ── AC Control ─────────────────────────────────────────────────────────────

async function sendACCommand(command) {
  if (!M5_STICK_IP) return;
  try {
    await axios.get(`http://${M5_STICK_IP}/ac/${command}`, { timeout: 5000 });
    logger.info(`AC command sent: ${command}`);
  } catch (error) {
    logger.error(`Failed to send AC command "${command}":`, error.message);
  }
}

async function turnACOn(temperature) {
  if (isAcOn) return;
  await sendACCommand('on');
  isAcOn = true;
  await bot.sendMessage(TELEGRAM_CHAT_ID, `🌡️ Температура ${temperature}°C — кондиционер включён автоматически`);
}

async function turnACOff(temperature) {
  if (!isAcOn) return;
  await sendACCommand('off');
  isAcOn = false;
  await bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Температура ${temperature}°C — кондиционер выключен`);
}

async function sendTemperatureToStick(current, threshold) {
  if (!M5_STICK_IP) return;
  try {
    await axios.get(`http://${M5_STICK_IP}/temperature`, {
      params: { current, threshold },
      timeout: 5000,
    });
  } catch (error) {
    logger.error('Failed to send temperature to stick:', error.message);
  }
}

// ── Air quality check ──────────────────────────────────────────────────────

async function checkAirPollution() {
  try {
    const response = await axios.get(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`, {
      params: {
        api_key: THINGSPEAK_API_KEY,
        results: 1,
      },
    });

    const { feeds } = response.data;
    if (feeds.length > 0) {
      const latestEntry = feeds[0];
      const airPollution = parseFloat(latestEntry.field3);
      const airQualityThreshold = isNight() ? AIR_QUALITY_NIGHT_THRESHOLD : AIR_QUALITY_THRESHOLD;

      if (airPollution > airQualityThreshold) {
        const message = `⚠️ Attention! Air pollution index exceeded: ${airPollution} 😷`;
        logger.info(`Notification sent: ${message}`);
        if (!wasPollutionAlertSent || airPollution > lastAirPollution) {
          await bot.sendMessage(TELEGRAM_CHAT_ID, message);
          wasPollutionAlertSent = true;
        }
      } else {
        if (wasPollutionAlertSent) {
          const message = `✅ Air quality has normalized: ${airPollution}`;
          await bot.sendMessage(TELEGRAM_CHAT_ID, message);
          logger.info(`Notification sent: ${message}`);
          wasPollutionAlertSent = false;
        }
        logger.info(`Air quality is normal: ${airPollution}`);
      }
      lastAirPollution = airPollution;
    }
  } catch (error) {
    logger.error('Error fetching data from ThingSpeak:', error);
  }
}

// ── Temperature check + AC control ────────────────────────────────────────

async function checkTemperature() {
  try {
    const response = await axios.get(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`, {
      params: {
        api_key: THINGSPEAK_API_KEY,
        results: 1,
      },
    });

    const { feeds } = response.data;
    if (feeds.length > 0) {
      const latestEntry = feeds[0];
      const temperature = parseFloat(latestEntry.field1);

      // Telegram уведомления (оригинальная логика)
      if (temperature > TEMPERATURE_THRESHOLD) {
        const message = `⚠️ Attention! Temperature exceeded: ${temperature} °C 🥵`;
        logger.info(`Notification sent: ${message}`);
        if (!wasTemperatureAlertSent || temperature > lastTemperature) {
          await bot.sendMessage(TELEGRAM_CHAT_ID, message);
          wasTemperatureAlertSent = true;
        }
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

      if (!isNaN(acOnThreshold) && M5_STICK_IP) {
        if (temperature >= acOnThreshold) {
          await turnACOn(temperature);
        } else if (temperature <= acOffThreshold) {
          await turnACOff(temperature);
        }
      }

      lastTemperature = temperature;
    }
  } catch (error) {
    logger.error('Error fetching data from ThingSpeak:', error);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

checkAirPollution();
checkTemperature();

cron.schedule(CRON_EXPRESSION, checkAirPollution);
cron.schedule(CRON_EXPRESSION, checkTemperature);
