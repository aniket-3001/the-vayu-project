/*
 * Vayu measuring unit: an ESP32 reading a Sensirion SPS30 particle sensor, and sending each reading to the Vayu app
 * over Bluetooth Low Energy. One 18-byte packet about every two seconds, on one notify characteristic.
 *
 * NOT YET COMPILED OR RUN ON HARDWARE. It was written against the libraries' public examples. Compile it, and if a
 * library call differs in the version you install, change `readSensor()`: the Bluetooth part does not depend on it.
 *
 * Libraries (Arduino Library Manager):
 *   - NimBLE-Arduino      (h2zero)
 *   - sps30               (Paul van Haastrecht, "sps30" for Arduino)
 *   - Adafruit SHT31      (optional temperature and humidity; set HAVE_SHT31 to 1)
 *
 * Wiring (ESP32 DevKit, I2C):
 *   SPS30 pin 1 VDD  -> 5 V (VIN)       SPS30 pin 2 SDA -> GPIO 21
 *   SPS30 pin 3 SCL  -> GPIO 22         SPS30 pin 4 SEL -> GND (this selects I2C)
 *   SPS30 pin 5 GND  -> GND
 *   (the SHT31, if fitted, shares SDA and SCL, address 0x44, powered from 3.3 V)
 *
 * The packet layout is the one in apps/web/src/devices/unitProtocol.ts (little-endian):
 *   0 u8 version=1 | 1 u8 flags (bit0 particles valid, bit1 climate valid, bit2 warming)
 *   2 u16 PM1.0 x10 | 4 u16 PM2.5 x10 | 6 u16 PM4.0 x10 | 8 u16 PM10 x10
 *  10 i16 temperature x100 | 12 u16 humidity x100 | 14 u32 uptime seconds
 */
#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Wire.h>
#include <sps30.h>

#define HAVE_SHT31 0
#if HAVE_SHT31
#include <Adafruit_SHT31.h>
Adafruit_SHT31 sht31;
#endif

// The same identifiers the app looks for (apps/web/src/devices/unitProtocol.ts).
static const char* SERVICE_UUID = "b7c5a1f0-6a7e-4c1b-9b6d-5a1d76617975";
static const char* READING_UUID = "b7c5a1f1-6a7e-4c1b-9b6d-5a1d76617975";

static const uint8_t PACKET_BYTES = 18;
static const uint32_t SEND_EVERY_MS = 2000;
// The SPS30's fan needs a few seconds to settle before its numbers are used.
static const uint32_t WARMUP_MS = 10000;

SPS30 sps30;
NimBLECharacteristic* reading = nullptr;
bool connected = false;
uint32_t startedAt = 0;
uint32_t lastSent = 0;

class Callbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*) { connected = true; }
  void onDisconnect(NimBLEServer*) {
    connected = false;
    // Be findable again at once, so the app can reconnect.
    NimBLEDevice::getAdvertising()->start();
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

// One reading from the particle sensor. Returns false when it has none ready.
static bool readSensor(float& pm1, float& pm25, float& pm4, float& pm10) {
  struct sps_values v;
  uint8_t error = sps30.GetValues(&v);
  if (error != SPS30_ERR_OK) return false;
  pm1 = v.MassPM1;
  pm25 = v.MassPM2;
  pm4 = v.MassPM4;
  pm10 = v.MassPM10;
  return true;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  startedAt = millis();

  if (!sps30.begin(&Wire)) Serial.println("SPS30: could not start I2C");
  if (!sps30.probe()) Serial.println("SPS30: not found. Check the wiring and that SEL goes to GND.");
  sps30.reset();
  if (!sps30.start()) Serial.println("SPS30: could not start measuring");
#if HAVE_SHT31
  if (!sht31.begin(0x44)) Serial.println("SHT31: not found; sending without climate");
#endif

  // The name ends in the last four digits of the board's address, so more than one unit can be told apart.
  String address = NimBLEDevice::getAddress().toString().c_str();
  address.replace(":", "");
  address.toUpperCase();
  String name = "Vayu-" + address.substring(address.length() - 4);
  NimBLEDevice::init(name.c_str());

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new Callbacks());
  NimBLEService* service = server->createService(SERVICE_UUID);
  reading = service->createCharacteristic(READING_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  service->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.print("Advertising as ");
  Serial.println(name);
}

void loop() {
  uint32_t now = millis();
  if (now - lastSent < SEND_EVERY_MS) return;
  lastSent = now;

  uint8_t packet[PACKET_BYTES] = {0};
  packet[0] = 1;  // version
  float pm1 = 0, pm25 = 0, pm4 = 0, pm10 = 0;
  uint8_t flags = 0;
  if (readSensor(pm1, pm25, pm4, pm10)) {
    flags |= 0b0001;
    putU16(packet + 2, tenths(pm1));
    putU16(packet + 4, tenths(pm25));
    putU16(packet + 6, tenths(pm4));
    putU16(packet + 8, tenths(pm10));
  }
  if (now - startedAt < WARMUP_MS) flags |= 0b0100;
#if HAVE_SHT31
  float t = sht31.readTemperature();
  float h = sht31.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    flags |= 0b0010;
    putU16(packet + 10, (uint16_t)(int16_t)lroundf(t * 100.0f));
    putU16(packet + 12, (uint16_t)lroundf(h * 100.0f));
  }
#endif
  packet[1] = flags;
  uint32_t uptime = (now - startedAt) / 1000;
  packet[14] = uptime & 0xFF;
  packet[15] = (uptime >> 8) & 0xFF;
  packet[16] = (uptime >> 16) & 0xFF;
  packet[17] = (uptime >> 24) & 0xFF;

  reading->setValue(packet, PACKET_BYTES);
  if (connected) reading->notify();

  Serial.printf("PM1 %.1f  PM2.5 %.1f  PM4 %.1f  PM10 %.1f  flags %u\n", pm1, pm25, pm4, pm10, flags);
}
