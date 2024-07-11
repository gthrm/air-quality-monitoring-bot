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
    CRON_EXPRESSION
} = process.env;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let lastAirPollution = 0;
let wasPollutionAlertSent = false;

async function checkAirPollution() {
    try {
        const response = await axios.get(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`, {
            params: {
                api_key: THINGSPEAK_API_KEY,
                results: 1
            }
        });

        const feeds = response.data.feeds;
        if (feeds.length > 0) {
            const latestEntry = feeds[0];
            const airPollution = parseFloat(latestEntry.field3);

            if (airPollution > AIR_QUALITY_THRESHOLD) {
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

checkAirPollution();

cron.schedule(CRON_EXPRESSION, checkAirPollution);