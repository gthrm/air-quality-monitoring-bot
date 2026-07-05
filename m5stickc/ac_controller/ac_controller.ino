/*
 * AC Controller для M5StickC Plus 2
 * Raw IR данные из базы Flipper Zero (Midea — OEM основа Vortex)
 *
 * HTTP API:
 *   GET /ac/on    — включить
 *   GET /ac/off   — выключить
 *   GET /status   — состояние JSON
 *
 * Кнопка A — ручное переключение
 *
 * Библиотеки (Arduino Library Manager):
 *   - M5StickCPlus2
 *   - IRremoteESP8266
 */

#include <M5StickCPlus2.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

const char* WIFI_SSID = "REDACTED_WIFI_SSID";
const char* WIFI_PASS = "REDACTED_WIFI_PASSWORD";

const uint16_t IR_PIN = 19;

// Raw Midea POWER (из Flipper IRDB, 38kHz)
// Это toggle — одно нажатие включает, следующее выключает
const uint16_t AC_POWER_RAW[] = {
  4459, 4369, 593, 1562, 590, 487, 599, 1555, 597, 481, 595, 482, 594, 483,
  593, 485, 591, 1563, 599, 1555, 596, 481, 595, 482, 594, 484, 592, 485,
  591, 486, 590, 1565, 597, 479, 596, 481, 594, 1559, 593, 1562, 590, 1565,
  597, 1557, 595, 482, 594, 484, 592, 485, 591, 1564, 598, 1556, 596, 1559,
  593, 1561, 591, 1564, 598, 1556, 596, 1558, 594, 1561, 591, 1564, 598,
  1556, 595, 1559, 593, 1561, 591, 486, 590, 1565, 597, 1557, 595, 1559,
  593, 1562, 590, 488, 598, 478, 598, 479, 597, 5158, 4453, 4375, 597, 480,
  595, 1558, 594, 484, 592, 1563, 589, 1565, 597, 1558, 594, 1560, 592, 485,
  591, 487, 589, 1565, 597, 1557, 594, 1560, 592, 1562, 590, 1565, 597, 479,
  596, 1558, 594, 1561, 591, 486, 590, 488, 598, 478, 598, 480, 596, 1558,
  594, 1561, 591, 1563, 599, 478, 598, 479, 596, 481, 595, 482, 594, 484,
  592, 485, 591, 486, 600, 478, 598, 479, 597, 480, 595, 481, 595, 483, 593,
  484, 592, 485, 591, 487, 589, 488, 598, 1555, 596, 481, 594, 483, 593,
  484, 592, 485, 591, 1564, 598, 1556, 596, 1559, 593
};
const uint16_t AC_POWER_RAW_LEN = sizeof(AC_POWER_RAW) / sizeof(AC_POWER_RAW[0]);

IRsend irsend(IR_PIN);
WebServer server(80);
bool acIsOn = false;

void sendPower() {
  irsend.sendRaw(AC_POWER_RAW, AC_POWER_RAW_LEN, 38);
}

void updateDisplay() {
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.println("AC Control");
  if (acIsOn) {
    M5.Lcd.setTextColor(GREEN);
    M5.Lcd.println("  AC: ON");
  } else {
    M5.Lcd.setTextColor(RED);
    M5.Lcd.println(" AC: OFF");
  }
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(YELLOW);
  M5.Lcd.println();
  M5.Lcd.println(WiFi.localIP().toString());
}

void handleACOn() {
  if (!acIsOn) { sendPower(); acIsOn = true; }
  updateDisplay();
  server.send(200, "application/json", "{\"status\":\"ok\",\"ac\":\"on\"}");
}

void handleACOff() {
  if (acIsOn) { sendPower(); acIsOn = false; }
  updateDisplay();
  server.send(200, "application/json", "{\"status\":\"ok\",\"ac\":\"off\"}");
}

void handleStatus() {
  server.send(200, "application/json",
    "{\"ac\":\"" + String(acIsOn ? "on" : "off") + "\",\"ip\":\"" + WiFi.localIP().toString() + "\"}");
}

void setup() {
  M5.begin();
  irsend.begin();
  Serial.begin(115200);

  M5.Lcd.setRotation(3);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextSize(1);
  M5.Lcd.println("WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    M5.Lcd.fillScreen(RED);
    M5.Lcd.println("WiFi FAIL");
    return;
  }

  MDNS.begin("accontrol");
  server.on("/ac/on",  HTTP_GET, handleACOn);
  server.on("/ac/off", HTTP_GET, handleACOff);
  server.on("/status", HTTP_GET, handleStatus);
  server.begin();

  Serial.println("Ready: " + WiFi.localIP().toString());
  updateDisplay();
}

void loop() {
  M5.update();
  server.handleClient();

  if (M5.BtnA.wasPressed()) {
    sendPower();
    acIsOn = !acIsOn;
    updateDisplay();
    Serial.println(acIsOn ? "[BTN] ON" : "[BTN] OFF");
  }
}
