import type { UnitTransport } from './ble';
import { encodePacket } from './unitProtocol';

/**
 * A made-up unit for the prototype, so the Devices screen can be tried with no hardware. It sends a drifting reading
 * every second and a half. Its numbers are shown and labelled as simulated, and are never kept or counted anywhere.
 */
export const simulatedUnit: UnitTransport = {
  supported: () => true,
  connect(handlers) {
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      const pm25 = 38 + 14 * Math.sin(tick / 9) + 4 * Math.sin(tick / 2.3);
      handlers.onPacket(
        encodePacket({
          pm1: pm25 * 0.7,
          pm25,
          pm4: pm25 * 1.1,
          pm10: pm25 * 1.3,
          temperatureC: 27.6,
          humidityPct: 48,
          uptimeS: tick * 2,
          warming: false,
        }),
      );
    }, 1500);
    return Promise.resolve({
      name: 'Vayu-SIM0',
      simulated: true,
      disconnect: () => {
        window.clearInterval(timer);
        handlers.onDisconnect();
      },
    });
  },
};
