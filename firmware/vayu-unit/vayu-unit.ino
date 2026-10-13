/*
 * Vayu measuring unit: an ESP32-S3 reading a Sensirion SPS30 particle sensor over UART, and sending each reading to
 * the Vayu app over Bluetooth Low Energy. One 20-byte packet about every two seconds, on one notify characteristic.
 *
 * Board:     ESP32S3 Dev Module, "USB CDC On Boot: Enabled" (so Serial is the USB port)
 * Libraries: "Sensirion UART SPS30" (Library Manager; it brings "Sensirion Core"). Bluetooth is the ESP32 core's own
 *            BLE library, so there is nothing else to install.
 *
 * Wiring (UART; the SPS30's SEL pin, pin 4, is left unconnected, which selects UART):
 *   SPS30 pin 1 VDD -> 5 V           SPS30 pin 2 RX -> GPIO 17 (ESP32 TX)
 *   SPS30 pin 3 TX  -> GPIO 18 (ESP32 RX)           SPS30 pin 4 SEL -> not connected
 *   SPS30 pin 5 GND -> GND
 *
 * The packet layout is the one in packages/unit/src/unitProtocol.ts (little-endian):
 *   0 u8 version=1 | 1 u8 flags (bit0 particles valid, bit1 climate valid, bit2 warming, bit3 on the purifier)
 *   2 u16 PM1.0 x10 | 4 u16 PM2.5 x10 | 6 u16 PM4.0 x10 | 8 u16 PM10 x10
 *  10 i16 temperature x100 | 12 u16 humidity x100 | 14 u32 uptime seconds
 *  18 u16 short id of the tag on the purifier (0 when none)
 * This unit has no temperature or humidity sensor yet, so bit1 stays 0 and those bytes are 0.
 * Bit 3 and bytes 18-19 are set while a tag reader sees the tag on the purifier (see TagReader.h; with no reader fitted
 * they stay 0). The tag counts as present for a few seconds after its last read, so one missed read does not flip it.
 */
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <HardwareSerial.h>
#include <SensirionUartSps30.h>
#include "TagReader.h"

// The same identifiers the app looks for (apps/web/src/devices/unitProtocol.ts).
static const char* SERVICE_UUID = "b7c5a1f0-6a7e-4c1b-9b6d-5a1d76617975";
static const char* READING_UUID = "b7c5a1f1-6a7e-4c1b-9b6d-5a1d76617975";

static const int SENSOR_RX_PIN = 18;  // ESP32 RX  <- SPS30 pin 3 (TX)
static const int SENSOR_TX_PIN = 17;  // ESP32 TX  -> SPS30 pin 2 (RX)

static const uint8_t PACKET_BYTES = 20;
static const uint32_t SEND_EVERY_MS = 2000;
// The SPS30's fan needs a few seconds to settle before its numbers are used.
static const uint32_t WARMUP_MS = 10000;
// The tag reader is asked once a second, and the tag counts as present for 3 seconds after it was last read.
static const uint32_t TAG_POLL_MS = 1000;
static const uint32_t TAG_HOLD_MS = 3000;

HardwareSerial SensorSerial(1);
SensirionUartSps30 sensor;
BLECharacteristic* reading = nullptr;
volatile bool connected = false;
// Set when the app connects: the radio draws a burst of current, which can briefly reset the sensor, so it is started
// again to be sure it is measuring.
volatile bool restartSensor = false;
bool sensorRunning = false;
uint8_t failedReads = 0;
uint32_t startedAt = 0;
uint32_t lastSent = 0;
uint32_t lastTry = 0;
uint32_t lastTagPoll = 0;
uint32_t lastTagSeen = 0;
uint16_t lastTag = 0;  // short id of the tag last read; 0 when none yet

class Callbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected = true;
    restartSensor = true;
  }
  void onDisconnect(BLEServer*) override {
    connected = false;
    // Be findable again at once, so the app can reconnect.
    BLEDevice::startAdvertising();
  }
};

static void putU16(uint8_t* p, uint16_t v) {
  p[0] = v & 0xFF;
  p[1] = v >> 8;
}

static uint16_t tenths(float micrograms) {
  if (!(micrograms >= 0.0f)) return 0;
  float t = micrograms * 10.0f + 0.5f;
  return t > 65535.0f ? 65535 : (uint16_t)t;
}

static void say(const char* what, int16_t error) {
  char message[64];
  errorToString(error, message, sizeof(message));
  Serial.print(what);
  Serial.print(": ");
  Serial.println(message);
}

// Starts the sensor's fan and measuring. Returns false, and says why, if it cannot.
static bool startSensor() {
  sensor.stopMeasurement();  // it may still be measuring from before; this fails harmlessly when idle
  int8_t serial[32] = {0};
  int16_t error = sensor.readSerialNumber(serial, 32);
  if (error != 0) {
    say("SPS30 not answering. Check power (5 V), TX and RX not swapped, and that SEL is unconnected", error);
    return false;
  }
  Serial.print("SPS30 serial number: ");
  Serial.println((const char*)serial);
  error = sensor.startMeasurement(SPS30_OUTPUT_FORMAT_OUTPUT_FORMAT_FLOAT);
  if (error != 0) {
    say("SPS30 could not start measuring", error);
    return false;
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  startedAt = millis();

  SensorSerial.begin(115200, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
  sensor.begin(SensorSerial);
  sensorRunning = startSensor();

  // The name ends in four hex digits of the board's own address, so more than one unit can be told apart.
  char name[16];
  snprintf(name, sizeof(name), "Vayu-%04X", (unsigned)((ESP.getEfuseMac() >> 32) & 0xFFFF));
  BLEDevice::init(name);

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new Callbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  reading = service->createCharacteristic(
      READING_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.print("Advertising as ");
  Serial.println(name);
}

void loop() {
  uint32_t now = millis();
  // Start the sensor again when the app connects, and, if it is not measuring (it was not there at power-on, or it reset
  // and now answers with nothing), every few seconds until it is. Nothing needs pressing on the board.
  if (restartSensor) {
    restartSensor = false;
    delay(500);
    sensorRunning = startSensor();
    failedReads = 0;
    lastTry = millis();
  } else if (!sensorRunning && now - lastTry > 3000) {
    lastTry = now;
    sensorRunning = startSensor();
    failedReads = 0;
  }
  if (now - lastTagPoll >= TAG_POLL_MS) {
    lastTagPoll = now;
    uint8_t id[10];
    uint8_t length = readTag(id, sizeof(id));
    if (length > 0) {
      lastTag = tagShortId(id, length);
      lastTagSeen = now;
    }
  }
  if (now - lastSent < SEND_EVERY_MS) return;
  lastSent = now;

  uint8_t packet[PACKET_BYTES] = {0};
  packet[0] = 1;  // version
  uint8_t flags = 0;
  float pm1 = 0, pm25 = 0, pm4 = 0, pm10 = 0;
  float nc05 = 0, nc1 = 0, nc25 = 0, nc4 = 0, nc10 = 0, size = 0;
  if (sensorRunning) {
    int16_t error = sensor.readMeasurementValuesFloat(pm1, pm25, pm4, pm10, nc05, nc1, nc25, nc4, nc10, size);
    if (error == 0) {
      flags |= 0b0001;
      putU16(packet + 2, tenths(pm1));
      putU16(packet + 4, tenths(pm25));
      putU16(packet + 6, tenths(pm4));
      putU16(packet + 8, tenths(pm10));
      failedReads = 0;
    } else {
      say("SPS30 read", error);
      // Three failures in a row: the sensor has stopped measuring. Start it again.
      if (++failedReads >= 3) {
        Serial.println("SPS30 stopped answering with readings: starting it again");
        sensorRunning = false;
        lastTry = 0;
      }
    }
  }
  if (now - startedAt < WARMUP_MS) flags |= 0b0100;
  bool onPurifier = lastTag != 0 && now - lastTagSeen < TAG_HOLD_MS;
  if (onPurifier) {
    flags |= 0b1000;
    putU16(packet + 18, lastTag);
  }
  packet[1] = flags;
  uint32_t uptime = (now - startedAt) / 1000;
  packet[14] = uptime & 0xFF;
  packet[15] = (uptime >> 8) & 0xFF;
  packet[16] = (uptime >> 16) & 0xFF;
  packet[17] = (uptime >> 24) & 0xFF;

  reading->setValue(packet, PACKET_BYTES);
  if (connected) reading->notify();

  Serial.printf("PM1 %.1f  PM2.5 %.1f  PM4 %.1f  PM10 %.1f  ug/m3  flags %u  %s\n", pm1, pm25, pm4, pm10, flags,
                connected ? "app connected" : "waiting for the app");
}
