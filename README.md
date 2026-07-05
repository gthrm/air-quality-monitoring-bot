# Air Quality Monitoring Bot

This project is a Node.js service that monitors air quality using ThingSpeak and sends notifications to a Telegram channel when the air quality index exceeds a specified threshold. The service checks the air quality every 10 seconds and only sends subsequent notifications if the air quality index increases or normalizes.

It can also automatically turn an air conditioner on/off based on temperature, by sending IR commands through an M5StickC over HTTP.

## Prerequisites

- Node.js
- npm (Node Package Manager)
- ThingSpeak account and API key
- Telegram bot and chat ID

## Setup

1. **Clone the repository**:

    ```sh
    git clone https://github.com/gthrm/air-quality-monitoring-bot
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
    AIR_QUALITY_NIGHT_THRESHOLD=your_air_quality_threshold
    TEMPERATURE_THRESHOLD=30
    CRON_EXPRESSION=*/5 * * * *

    # AC control via M5StickC (optional)
    M5_STICK_IP=192.168.1.XXX        # M5StickC IP on the local network (or accontrol.local)
    AC_TEMPERATURE_THRESHOLD=28      # turn AC on at this temperature
    AC_TEMPERATURE_RESTORE=24        # turn AC off at this temperature (hysteresis)
    AC_RETRY_MINUTES=10              # resend "on" if temperature hasn't dropped after this many minutes
    ```

## Usage

1. **Run the service**:

    ```sh
    npm start
    ```

    The service will start checking the air quality every 10 seconds and will send notifications to the specified Telegram chat if the air quality index exceeds the threshold.

## Code Explanation

- `index.js`: Main file that initializes the Telegram bot, schedules the air quality and temperature checks, handles notifications, and controls the AC via the M5StickC.
- `utils/logger.utils.js`: Logger configuration using `winston` for logging information and errors.
- `.env`: Environment file containing your API keys and configuration settings.

### Cron Schedule

The cron schedule `*/10 * * * * *` ensures that the `checkAirPollution` function runs every 10 seconds.

## AC Control (M5StickC)

If `M5_STICK_IP` and `AC_TEMPERATURE_THRESHOLD` are set, the bot polls the temperature and sends IR commands to an M5StickC to switch the air conditioner on/off:

- Temperature reaches `AC_TEMPERATURE_THRESHOLD` → AC is turned on (`GET http://<M5_STICK_IP>/ac/on`).
- Temperature drops to `AC_TEMPERATURE_RESTORE` (defaults to `AC_TEMPERATURE_THRESHOLD - 2` if unset) → AC is turned off (`GET http://<M5_STICK_IP>/ac/off`).

A Telegram notification is sent whenever the AC state changes.

Since the IR command is fire-and-forget (no confirmation from the AC unit itself), the bot also guards against a missed command: if the stick believes the AC is already on but the temperature hasn't dropped after `AC_RETRY_MINUTES`, the bot resends the "on" command anyway.

The `m5stickc/` directory contains the Arduino firmware for the device:

- `m5stickc/ir_learn/ir_learn.ino`: sketch used to capture your AC's IR codes.
- `m5stickc/ac_controller/ac_controller.ino`: firmware that exposes the `/ac/on` and `/ac/off` HTTP endpoints and replays the learned IR codes.

## Contributing

Feel free to fork this repository and submit pull requests. Any contributions are welcome!

## License

This project is licensed under the MIT License.
