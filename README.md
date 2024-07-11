# Air Quality Monitoring Bot

This project is a Node.js service that monitors air quality using ThingSpeak and sends notifications to a Telegram channel when the air quality index exceeds a specified threshold. The service checks the air quality every 10 seconds and only sends subsequent notifications if the air quality index increases or normalizes.

## Prerequisites

- Node.js
- npm (Node Package Manager)
- ThingSpeak account and API key
- Telegram bot and chat ID

## Setup

1. **Clone the repository**:

    ```sh
    git clone https://github.com/yourusername/air-quality-monitoring-bot.git
    cd air-quality-monitoring-bot
    ```

2. **Install dependencies**:

    ```sh
    npm install
    ```

3. **Create a `.env` file** in the root directory and add your keys:

    ```
    THINGSPEAK_API_KEY=your_thingspeak_api_key
    THINGSPEAK_CHANNEL_ID=your_thingspeak_channel_id
    TELEGRAM_TOKEN=your_telegram_bot_token
    TELEGRAM_CHAT_ID=your_telegram_chat_id
    AIR_QUALITY_THRESHOLD=your_air_quality_threshold
    ```

## Usage

1. **Run the service**:

    ```sh
    npm start
    ```

    The service will start checking the air quality every 10 seconds and will send notifications to the specified Telegram chat if the air quality index exceeds the threshold.

## Code Explanation

- `index.js`: Main file that initializes the Telegram bot, schedules the air quality checks, and handles notifications.
- `utils/logger.utils.js`: Logger configuration using `winston` for logging information and errors.
- `.env`: Environment file containing your API keys and configuration settings.

### Cron Schedule

The cron schedule `*/10 * * * * *` ensures that the `checkAirPollution` function runs every 10 seconds.

## Contributing

Feel free to fork this repository and submit pull requests. Any contributions are welcome!

## License

This project is licensed under the MIT License.
