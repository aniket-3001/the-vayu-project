// The tag on the purifier. A reader module gives this sketch the tag's ID; which module is not decided yet (a PN532 over
// I2C or an RC522 over SPI are the usual choices), so this is an interface with a stub that sees no tag. Replace
// readTag() with the driver for the chosen module; nothing else in the sketch changes.
#pragma once
#include <stdint.h>

// Fills `id` with the tag's unique ID (at most `maxLen` bytes) and returns its length, or 0 when no tag is in range.
inline uint8_t readTag(uint8_t* id, uint8_t maxLen) {
  (void)id;
  (void)maxLen;
  return 0;  // STUB: no reader fitted, so the unit never reports that it is on a purifier.
}

// A short id for the packet: a 16-bit hash of the tag's ID, never 0 (0 means "no tag" in the packet).
inline uint16_t tagShortId(const uint8_t* id, uint8_t len) {
  uint16_t h = 0x811C;
  for (uint8_t i = 0; i < len; i++) h = (uint16_t)((h ^ id[i]) * 0x0101u);
  return h == 0 ? 1 : h;
}
