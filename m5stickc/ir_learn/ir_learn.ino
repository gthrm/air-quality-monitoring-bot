/*
 * IR Code Learner для M5StickC Plus 2
 *
 * Встроенного IR-приёмника нет — нужен внешний модуль VS1838B / TSOP4838:
 *   OUT → G0 (или другой свободный GPIO)
 *   VCC → 3.3V
 *   GND → GND
 *
 * Направь пульт кондиционера на приёмник и нажми кнопку.
 * Скопируй вывод Serial Monitor — вставишь в ac_controller.ino
 *
 * Библиотеки (Arduino Library Manager):
 *   - M5StickCPlus2
 *   - IRremoteESP8266
 */

#include <M5StickCPlus2.h>
#include <IRrecv.h>
#include <IRremoteESP8266.h>
#include <IRutils.h>

const uint16_t IR_RECV_PIN = 0;          // куда подключён OUT приёмника
const uint16_t CAPTURE_BUFFER_SIZE = 512;
const uint8_t  TIMEOUT = 50;

IRrecv irrecv(IR_RECV_PIN, CAPTURE_BUFFER_SIZE, TIMEOUT, true);
decode_results results;

void setup() {
  M5.begin();
  Serial.begin(115200);
  irrecv.enableIRIn();

  M5.Lcd.setRotation(3);
  M5.Lcd.setTextSize(2);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.println("IR Learner");
  M5.Lcd.setTextSize(1);
  M5.Lcd.println("");
  M5.Lcd.println("Подключи VS1838B:");
  M5.Lcd.println("OUT -> G0");
  M5.Lcd.println("Жми кнопки пульта");

  Serial.println("IR Learner готов. Нажимай кнопки пульта...");
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println("=== Получен IR сигнал ===");
    Serial.print("Протокол: ");
    Serial.println(typeToString(results.decode_type));
    Serial.print("Код (HEX): 0x");
    Serial.println(results.value, HEX);
    Serial.print("Биты: ");
    Serial.println(results.bits);
    Serial.println("--- Raw data (для sendRaw): ---");
    Serial.print("uint16_t rawData[] = {");
    for (uint16_t i = 1; i < results.rawlen; i++) {
      Serial.print(results.rawbuf[i] * RAWTICK);
      if (i < results.rawlen - 1) Serial.print(", ");
    }
    Serial.println("};");
    Serial.print("uint16_t rawLen = ");
    Serial.print(results.rawlen - 1);
    Serial.println(";");
    Serial.println("========================");

    M5.Lcd.fillScreen(BLACK);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.setTextSize(2);
    M5.Lcd.println("Поймал!");
    M5.Lcd.setTextSize(1);
    M5.Lcd.print("Проток: ");
    M5.Lcd.println(typeToString(results.decode_type));
    M5.Lcd.print("0x");
    M5.Lcd.println(results.value, HEX);

    irrecv.resume();
  }
}
