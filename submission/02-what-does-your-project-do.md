**The problem.** Delhi has plenty of air-quality numbers, and none of them tells a parent what to do. One city figure cannot see one street. The nearest monitor may be kilometres from the school, and the reading may be hours old.

**What it does.** The Vayu Project is a free web app, with no sign-in and no install. You add the places you care about: Home, a school, a park. Each card shows the air from the nearest monitor with a fresh reading, and says which monitor, how far it is and how old the reading is. Then it says what to do: walk, mask, windows, whether a school assembly should be inside. A reading over six hours old gives no advice. Where there is no monitor, the number is labelled an Estimate. The Delhi pollution stage (GRAP) is shown as my estimate, never as the official order. A small measuring unit I built (ESP32-S3 and a laser particle sensor, over Bluetooth) shows your room's air beside the air outside.

**Who it is for.** Delhi families, schools and housing societies.

**Impact, with proof.** On the recorded morning after Diwali, 21 Oct 2025, Home read AQI 500 from a monitor 3.8 km away and the app said: avoid going out. On 9 Nov 2025 two places four kilometres apart got two answers: Home 424 (Stage III likely), the park 249 (Stage II). A city number cannot show that. It costs about $4.50 a month idle to run, and $0.0008 for an assistant question, so a school or society can host its own. 1,253 tests pass in one command.

**What I learned.** Keep the model's job small: fixed rules decide, the AI only words, and every number it uses is checked. Check your own screenshots: mine showed AQI 500 beside the wrong stage, and I fixed it and checked it against the monitors.

**Not yet:** the unit has not been compared with a monitor, and I have not run a pilot.
