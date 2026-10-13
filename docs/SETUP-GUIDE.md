# Setup guide: from the code to the apps on a phone

Five jobs are left that need a person, a phone, an Apple or AWS account, or hardware. This guide gives each one as small steps. Do the steps in order, tick them off, and stop at any step marked **STOP** and send the message it asks for.

Repository: `https://github.com/aniket-3001/the-vayu-project` (private; branch `main`).

| Part | Job                                             | Who                   | Needs first           |
| ---- | ----------------------------------------------- | --------------------- | --------------------- |
| 1    | Let the apps call the API (deploy the change)   | **Harsh**             | nothing               |
| 2    | Build and install the Android app               | **Aniket**            | nothing               |
| 3    | Build and install the iPhone app                | **Harsh** (has a Mac) | nothing               |
| 4    | Check the apps on a real phone                  | Aniket and Harsh      | Part 1, and 2 or 3    |
| 5    | Fit a tag reader so the unit knows the purifier | Aniket                | the parts, and Part 4 |

Parts 1, 2, 3 and 5 do not depend on each other. Part 4 needs Part 1, because until Harsh deploys the change the apps cannot load any data.

**One rule for everything below.** Nothing in this guide changes Harsh's live site or his AWS account, except Part 1, which Harsh does himself and checks before and after. Do not run `make deploy-site` at any point; the apps do not need it.

---

## Part 1. Let the apps call the API (Harsh)

**What this does.** The apps run from the addresses `https://localhost` (Android) and `capacitor://localhost` (iPhone). The API's CloudFront address refuses calls from other sites, so the apps would get no data. This change tells CloudFront to allow those two addresses, and only those. It adds one rule set and one small function to the stack. It does not touch the website files, the tables, the functions or the secrets.

**What you need.**

- Your AWS access with the profile named `vayu` on your computer (the same one you use to deploy).
- Node 22 or later, and git.
- Access to the repository (you were invited; accept it at `https://github.com/aniket-3001/the-vayu-project/invitations` if you have not).

### Get the code

- [ ] 1.1 Open Terminal. Go to a folder where you keep projects. **Do not use the folder your live deployment came from.** Use a fresh one:
  ```bash
  git clone https://github.com/aniket-3001/the-vayu-project.git vayu-mobile
  cd vayu-mobile
  ```
  If it asks you to sign in, use your GitHub account (or run `gh auth login` first).
- [ ] 1.2 Check you are on the right branch and the right code:
  ```bash
  git branch --show-current
  git log --oneline -1
  ```
  Expected: `main`, and a first line starting `Merge feature/guest-mode` (or a newer line).
- [ ] 1.3 Check the Node version:
  ```bash
  node -v
  ```
  Expected: `v22` or higher. If not, install Node 22 first.
- [ ] 1.4 Install the project's packages (about a minute):
  ```bash
  npm ci
  ```
  Expected: it ends without the word `error`. Warnings are fine.

### Read the change before deploying it

- [ ] 1.5 See which commits changed the infrastructure:
  ```bash
  git log --oneline -- infra
  ```
  The top two lines are the change: `Infra test: avoid a type assertion the linter rejects` and `Infra: allow the phone apps' origins to call the API through CloudFront`.
- [ ] 1.6 Read the change itself (about 80 lines of code, one file is a test):
  ```bash
  git show b39ae39 7b2f93e -- infra/lib
  ```
  What to look for: the list `MOBILE_ORIGINS` has exactly two entries, `https://localhost` and `capacitor://localhost`, and a function that answers `OPTIONS` only for those two.
- [ ] 1.7 Run the project's own checks (optional but recommended, 3 to 6 minutes). They never touch AWS:
  ```bash
  make prove
  ```
  Expected: the last line says `prove: lint, types, tests, cdk synth bundle check passed`.

### See exactly what AWS would change

- [ ] 1.8 Tell the terminal which AWS account to use, and check it is yours:
  ```bash
  export AWS_PROFILE=vayu
  export AWS_REGION=ap-south-1
  aws sts get-caller-identity
  ```
  Expected: the `Account` shown is `534212416249`. If it is any other account, **STOP**.
- [ ] 1.9 Show the difference between the code and what is deployed. This only reads; it changes nothing:
  ```bash
  cd infra
  npx cdk diff
  ```
- [ ] 1.10 Compare the result with this list. It shows **two kinds** of change:

  **A. The change for the phone apps (wanted):**
  - a new `AWS::CloudFront::ResponseHeadersPolicy` (named something like `SiteApiHeaders…`),
  - a new `AWS::CloudFront::Function` (named something like `SiteApiPreflight…`),
  - a changed `AWS::CloudFront::Distribution`, where **only** the two API cache behaviours (`/v1/*` and `/v1/me`) get the new headers policy and the function. The website's own behaviour and its files are not listed.

  **B. New code for six functions (not part of this job):** six `AWS::Lambda::Function` lines with a changed `Code` / `S3Key`: `ApiFunction`, `HarvestFunction`, `StationsFunction`, `FixCheck/StepFunction`, `IngestFunction` and `AlertLoop/SendFunction`. These appear because the repository has three commits made after the stack was last deployed (11 Oct, 21:11 UTC) that changed code those functions use: `0e4c194` (Remove the prototype build), `f4785f6` and `2ea4399` (Remove unused files). Deploying everything would put that newer code live.

  **STOP** and send the whole output to Aniket if you see anything else: a line starting `[-]` (something deleted) other than the single `[-] "Ref": "SiteSecurityHeaders…"` line inside the distribution, the word `replace` or `replacement`, or anything about `DynamoDB`, `S3 Bucket`, `Cognito`, `Secret`, `Step Functions` or `IAM`.

- [ ] 1.10b **Decide** (this is Harsh's call, because it is his live site and his bill). Either:
  - **Option 1: deploy everything shown.** Go on to step 1.11. The live API then runs the three newer commits too. Choose this only if you want that.
  - **Option 2: deploy only the phone-app change (recommended).** Build from the commit that matches what is live, with only the change added:
    ```bash
    cd ..    # back to the repository folder
    git switch -c cors-only $(git rev-list -1 --before="2026-10-11T21:11:37Z" origin/main)
    git cherry-pick b39ae39
    npm ci
    cd infra
    npx cdk diff
    ```
    Expected now: **only group A**. (This was tried against the live stack on 13 October from commit `761f1a0` plus `b39ae39`: the diff showed exactly the three group A items and no function changes. It only compared and deployed nothing.) If the six function lines are gone, the live functions match this commit, and you can deploy from here with step 1.11. If they are still listed, **STOP** and send the output to Aniket: it means the live code came from somewhere else.

### Deploy

- [ ] 1.11 Deploy (still inside `infra`):
  ```bash
  npx cdk deploy
  ```
  It prints the changes again and asks `Do you wish to deploy these changes (y/n)?`. Type `y` and press Enter.
- [ ] 1.12 Wait. CloudFront takes 5 to 15 minutes to roll a change out. The command ends with `✅ Vayu` and the stack outputs.

### Check it worked, and that the website is untouched

- [ ] 1.13 Open `https://d3lmq1mze2gup3.cloudfront.net` in a browser. Expected: the site opens as before. Also open `https://d3lmq1mze2gup3.cloudfront.net/#/week`; it should play the recorded days as before.
- [ ] 1.14 Ask CloudFront the browser's "may I?" question as the iPhone app would:
  ```bash
  curl -i -X OPTIONS https://d3lmq1mze2gup3.cloudfront.net/v1/assistant \
    -H "Origin: capacitor://localhost" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type"
  ```
  Expected: `HTTP/2 204`, and a line `access-control-allow-origin: capacitor://localhost`.
- [ ] 1.15 Same for the Android app:
  ```bash
  curl -i -X OPTIONS https://d3lmq1mze2gup3.cloudfront.net/v1/assistant \
    -H "Origin: https://localhost" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type"
  ```
  Expected: `HTTP/2 204` and `access-control-allow-origin: https://localhost`.
- [ ] 1.16 Check another site is **not** allowed:
  ```bash
  curl -i -X OPTIONS https://d3lmq1mze2gup3.cloudfront.net/v1/assistant \
    -H "Origin: https://evil.example" \
    -H "Access-Control-Request-Method: POST"
  ```
  Expected: it must **not** say `204`, and there must be **no** `access-control-allow-origin` line.
- [ ] 1.17 Check a normal read from an app origin gets the permission header, and a read with no origin does not:
  ```bash
  curl -si https://d3lmq1mze2gup3.cloudfront.net/v1/auth-config -H "Origin: capacitor://localhost" | head -20
  curl -si https://d3lmq1mze2gup3.cloudfront.net/v1/auth-config | head -20
  ```
  Expected: the first shows `access-control-allow-origin: capacitor://localhost`; the second shows no such line. Both return the JSON answer.
- [ ] 1.18 Message Aniket: **"Part 1 done"**, plus the output of step 1.14.

### If something is wrong

- If any check in 1.13 to 1.17 fails, **STOP** and send Aniket the command and its full output.
- To undo the change: from the repo folder run
  ```bash
  git revert --no-edit 7b2f93e b39ae39
  cd infra && npx cdk diff
  ```
  check the diff shows the three items from 1.10 being removed, then `npx cdk deploy`. The website and everything else stay as they were.

---

## Part 2. Build and install the Android app (Aniket)

**What this does.** GitHub builds the Android app on its own computers and gives you the installable file (an APK). Nothing is installed on your PC, and it uses no AWS.

**What you need.** An Android phone (Android 7 or later) and a way to move a file to it (USB cable, Google Drive, Telegram, email).

- [ ] 2.1 Open `https://github.com/aniket-3001/the-vayu-project` and sign in as `aniket-3001`.
- [ ] 2.2 Click the **Actions** tab.
- [ ] 2.3 If a yellow banner says **"Workflows aren't being run on this forked repository"**, click **"I understand my workflows, go ahead and enable them"**. (Forks start with this switched off.)
- [ ] 2.4 In the list on the left, click **android-debug**.
- [ ] 2.5 Click **Run workflow** (a grey button on the right). In the box that opens, leave **Branch: main**, and click the green **Run workflow**.
- [ ] 2.6 Wait a few seconds, refresh the page, and click the new run at the top (yellow dot = running).
- [ ] 2.7 Wait for a green tick. The first run takes about 8 to 15 minutes.
- [ ] 2.8 Scroll to the bottom of the run's page, to **Artifacts**. Click **vayu-debug-apk** to download a zip.
- [ ] 2.9 Unzip it. Inside is `app-debug.apk`.
- [ ] 2.10 Move `app-debug.apk` to the phone.
- [ ] 2.11 On the phone, open the file (from Files, Downloads or the app you sent it with).
- [ ] 2.12 If Android says it can't install from this source, tap **Settings**, switch on **Allow from this source**, press back, and tap **Install**.
- [ ] 2.13 If Google Play Protect says **"App blocked to protect your device"** or "unsafe app", tap **More details**, then **Install anyway**. (This is normal for a test app that is not from the Play Store.)
- [ ] 2.14 Tap **Open**. Expected: a short screen with a coloured **V** on a pale background, then it fades into the app's welcome screen.
- [ ] 2.15 Continue with Part 4.

### If the build fails (a red cross)

- Click the failed run, click the red step, and copy the last 40 lines of its log. Send them to Aniket. The three most common causes are a package that failed to install (step `npm ci`), a Java or Gradle error (step `./gradlew assembleDebug`), or a missing file. The build has never been run before, so a first-time failure is possible and fixable.

### Alternative: install by cable (needs Android Studio or the Android platform tools)

- [ ] On the phone: Settings, About phone, tap **Build number** seven times, then Settings, System, Developer options, switch on **USB debugging**.
- [ ] Connect by cable, accept the prompt on the phone, then run `adb install -r app-debug.apk`.

---

## Part 3. Build and install the iPhone app (Harsh, on the Mac)

**What this does.** Builds the app in Xcode and puts it on your iPhone with a free Apple ID. A free account's app stops opening after **7 days**; run it again from Xcode to refresh it.

**What you need.**

- A Mac with the latest **Xcode** from the App Store. Open Xcode once, accept the licence, and let it install extra components.
- Node 22 or later and git.
- An iPhone with iOS 15 or later, and its USB cable.
- An Apple ID (free is fine).

### Prepare the Mac

- [ ] 3.1 Get the code, if you did not already in Part 1 (use the same folder if you did):
  ```bash
  git clone https://github.com/aniket-3001/the-vayu-project.git vayu-mobile
  cd vayu-mobile
  ```
  If you already have the folder, run `git switch main && git pull` inside it.
- [ ] 3.2 Install the packages:
  ```bash
  npm ci
  ```
- [ ] 3.3 Ask Capacitor to check the Mac:
  ```bash
  cd apps/mobile
  npx cap doctor
  cd ../..
  ```
  Expected: under **iOS** it lists no problems. If it says Xcode is too old, update Xcode first.
- [ ] 3.4 Build the app for the phone and open it in Xcode (a minute or two):
  ```bash
  npm run mobile:ios
  ```
  Expected: Xcode opens with a project called **App**. Wait until the bar at the top stops saying **Resolving Package Graph** (it fetches the Bluetooth part).

### Prepare the iPhone

- [ ] 3.5 Plug the iPhone into the Mac. Unlock it. Tap **Trust This Computer** and enter the passcode.
- [ ] 3.6 On the iPhone: **Settings, Privacy & Security, Developer Mode**, switch it **on**, and let it restart. After it restarts, confirm **Turn On** and enter the passcode.

### Sign and run

- [ ] 3.7 In Xcode, add your Apple ID: menu **Xcode, Settings, Accounts**, click **+**, choose **Apple ID**, sign in. Close the window.
- [ ] 3.8 In the left panel click the blue **App** icon at the very top. In the middle panel under **TARGETS** click **App**.
- [ ] 3.9 Click the **Signing & Capabilities** tab.
- [ ] 3.10 Under **Team** choose **your name (Personal Team)**.
- [ ] 3.11 If it shows a red message **"Failed to register bundle identifier"**, change **Bundle Identifier** from `com.vayu.app` to something only you would use, such as `com.harsh.vayu`. Press Enter. The message should go away.
- [ ] 3.12 At the top of the window, in the device box next to the **Play** button, choose your **iPhone** (not a simulator).
- [ ] 3.13 Press the **Play** button (or Command+R). The first build takes a few minutes.
- [ ] 3.14 If Xcode says **"Could not launch App"** because the developer is not trusted: on the iPhone open **Settings, General, VPN & Device Management**, tap your Apple ID under **Developer App**, tap **Trust**, then press Play again in Xcode.
- [ ] 3.15 Expected on the iPhone: the app opens, showing a coloured **V** on a pale background for about a second, then the welcome screen.
- [ ] 3.16 Continue with Part 4.

### Keep the repository clean

- [ ] 3.17 Xcode wrote your Apple team (and maybe a new bundle ID) into one file. Do not commit it. Undo it with:
  ```bash
  git checkout apps/mobile/ios/App/App.xcodeproj/project.pbxproj
  git status
  ```
  Expected: `git status` shows nothing to commit. (The app already on your phone keeps working.)
- [ ] 3.18 Seven days later, if the app will not open, repeat steps 3.4, 3.12 and 3.13.

---

## Part 4. Check the apps on a real phone

Do this on the Android phone (Aniket) and the iPhone (Harsh). Part 1 must be done first, or steps 4.3 onwards will show errors instead of data. Tick each box, and write **P** (pass) or **F** (fail) and a note.

**Before you start.** Use mobile data or Wi-Fi, and in Settings switch the phone to **light mode** first (we check dark mode at the end).

| #    | Do this                                                                                                          | Expect                                                                                                                        | P/F |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --- |
| 4.1  | Look at the app icon on the home screen                                                                          | A colourful **V** (green to red) on a pale background, named **Vayu**                                                         |     |
| 4.2  | Open the app                                                                                                     | A **V** on a pale background for about 1 to 2 seconds, then a smooth fade into the welcome screen                             |     |
| 4.3  | Look at the welcome screen                                                                                       | Heading, then **Sign in**, **Create an account**, **Continue as guest**, **Try without login**, each with a short explanation |     |
| 4.4  | Check the top of the screen                                                                                      | Nothing hidden behind the notch, camera hole or status bar                                                                    |     |
| 4.5  | Tap **Continue as guest**                                                                                        | **My Air** opens, with a small person icon at the top                                                                         |     |
| 4.6  | Tap **Add a place**, search `Connaught Place`, choose it, name it `Home`                                         | A card with an AQI number, colour, the monitor's name and distance                                                            |     |
| 4.7  | Check the bottom                                                                                                 | The tab bar (My Air, Exposure, Map, AIR Lens) is clear of the home bar or gesture area                                        |     |
| 4.8  | Fully close the app (swipe it away) and open it again                                                            | It goes straight to **My Air** with `Home` still there. No welcome screen                                                     |     |
| 4.9  | Tap the person icon                                                                                              | "You're using Vayu as a guest", with the note that places stay on this phone, and **Sign in or create an account**            |     |
| 4.10 | Tap **Sign in or create an account**                                                                             | The welcome screen returns                                                                                                    |     |
| 4.11 | Tap **Create an account**, use an email you can read, a password of 8 or more characters, tap **Create account** | A screen asks for **the code we emailed you**                                                                                 |     |
| 4.12 | Open the email, type the 6-digit code, tap **Confirm**                                                           | You land in the app. (This creates a real login in Harsh's account service. Delete it at 4.16.)                               |     |
| 4.13 | Tap the person icon                                                                                              | "Signed in as" your email, and "Saved to your account"                                                                        |     |
| 4.14 | Tap **Sign out**                                                                                                 | The welcome screen returns                                                                                                    |     |
| 4.15 | Tap **Sign in**, enter the same email and password                                                               | You are in again, with your places                                                                                            |     |
| 4.16 | Person icon, **Delete my account**, **Yes, delete it**                                                           | The account is removed and the welcome screen returns                                                                         |     |
| 4.17 | Welcome screen, **Continue as guest**, then on My Air tap **Detect my location** (in Add a place)                | The phone asks for location permission; after **Allow**, a place appears                                                      |     |
| 4.18 | Tap **AIR Lens** at the bottom                                                                                   | The phone asks for the camera; after **Allow**, the camera picture shows with a haze drawn over it                            |     |
| 4.19 | Tap **Map**                                                                                                      | Map tiles load, monitors appear as coloured bubbles, you can drag and zoom                                                    |     |
| 4.20 | Tap the round **Ask** button, tap "Do I need a mask?"                                                            | An answer appears. (This checks that the API accepts a POST from the app)                                                     |     |
| 4.21 | On My Air with no places, tap **See the recorded days**                                                          | The seven recorded days open **in the same window**. A bar at the top has a button to leave                                   |     |
| 4.22 | Tap the leave button on that bar                                                                                 | You are back in the live app                                                                                                  |     |
| 4.23 | Switch the phone to **dark mode**, close the app fully, open it                                                  | The startup screen is dark with the same **V**                                                                                |     |
| 4.24 | Turn on **airplane mode**, then open the app                                                                     | The app opens and shows a readable message, not a blank white page                                                            |     |

### If a unit is available (the Bluetooth check)

You need the measuring unit powered on, within a metre of the phone.

| #    | Do this                                                           | Expect                                                                      | P/F |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | --- |
| 4.25 | On My Air tap **Add device**, choose where it is, continue        | A device is added                                                           |     |
| 4.26 | Open **Your room**, tap **Reconnect device**                      | The phone asks for Bluetooth (Android: "Nearby devices"). Allow it          |     |
| 4.27 | In the list that appears, choose the unit named **Vayu-XXXX**     | **Connected**; a reading appears and updates about every 2 seconds          |     |
| 4.28 | Refuse the Bluetooth permission once (reinstall or reset it)      | A readable message such as "Bluetooth permission was refused…", not a crash |     |
| 4.29 | Switch the phone's Bluetooth off, then press **Reconnect device** | "Bluetooth is off. Turn it on and try again."                               |     |

### Report back

Send Aniket the table with P or F and a note for each F. For any F, add the phone model, the Android or iOS version, and a screenshot. One screenshot of 4.2 (the startup screen) and one of 4.6 (a place card) are also useful.

---

## Part 5. Fit a tag reader so the unit knows when it sits on the purifier (Aniket)

**What this does.** A small reader on the unit reads a sticker on top of the purifier. When it does, the unit says "I am on the purifier", and the app shows that air as **Purified air**, apart from the room. The code is already in the app and the packet. Two things are missing: the reader hardware, and the few lines of firmware that talk to it. **Nothing in this part has been tested on a real unit.**

### 5A. Choose and buy

- [ ] 5.1 Buy **one NFC reader module that uses the PN532 chip, with I2C** (an "NFC PN532 module V3" or an Adafruit PN532 breakout; both work with a 3.3 V board). This is the recommended choice: it needs four wires.
- [ ] 5.2 Buy **NTAG213 or NTAG215 NFC stickers** (13.56 MHz). Buy at least three, for spares.
- [ ] 5.3 If the top of the purifier is **metal**, buy **"on-metal" NFC tags** instead. A normal sticker does not read on metal.
- [ ] 5.4 Buy a set of female-to-female jumper wires (about four wires needed).
- [ ] 5.5 Optional alternative: an **RC522** RFID module (cheaper, but needs seven wires). If you buy this one, tell me in 5.8.

### 5B. Tell me what you bought

- [ ] 5.6 When the parts arrive, read the **exact name** printed on the reader board and its seller's listing.
- [ ] 5.7 Look at your ESP32-S3 board and note its exact name.
- [ ] 5.8 Send me: the reader's name and chip (PN532 or RC522), the tag type (NTAG213, NTAG215 or on-metal), and the ESP32-S3 board name. I will then replace the placeholder in `firmware/vayu-unit/TagReader.h` with the real driver (for a PN532: the Adafruit PN532 library over I2C), and tell you the one library to install.

### 5C. Fit it

The measuring unit already uses GPIO 17 and 18 for the particle sensor. Do not reuse those.

- [ ] 5.9 Switch everything **off** and unplug the USB cable.
- [ ] 5.10 Set the reader to **I2C mode**. On most PN532 boards there are two small switches; the table printed on the board (or on the seller's page) shows which positions mean I2C. Set them to match and write the positions down.
- [ ] 5.11 Wire the reader to the ESP32-S3 (check the pin names against your board before powering it on):

  | Reader pin | ESP32-S3 pin                                                                      |
  | ---------- | --------------------------------------------------------------------------------- |
  | VCC        | 3V3 (3.3 volts). Use 3.3 V unless the module's page says it needs 5 V             |
  | GND        | GND                                                                               |
  | SDA        | GPIO 8 (the usual I2C data pin on ESP32-S3 boards; I will confirm for your board) |
  | SCL        | GPIO 9 (the usual I2C clock pin; I will confirm for your board)                   |

- [ ] 5.12 Mount the reader so its flat face points **down** from the bottom of the unit's case, with **no metal** between it and the table. Plastic or cardboard is fine.
- [ ] 5.13 Stick one tag on top of the purifier, at the spot where the unit will sit.
- [ ] 5.14 Put the unit on that spot. The reader and the tag should be **within 2 cm** of each other (these readers work up to about 3 to 5 cm in the best case). If the purifier top is metal, put a 3 mm piece of foam or cardboard under an ordinary sticker, or use an on-metal tag.

### 5D. Load the new firmware

- [ ] 5.15 Wait for me to send the updated firmware (after 5.8). Pull it: `git switch main && git pull`.
- [ ] 5.16 Open **Arduino IDE** (version 2).
- [ ] 5.17 Install the ESP32 boards if you have not: **Tools, Board, Boards Manager**, search `esp32`, install **esp32 by Espressif Systems**.
- [ ] 5.18 Install the libraries: **Tools, Manage Libraries**, search and install **Sensirion UART SPS30** (it also installs Sensirion Core), and the reader library I name in 5.8.
- [ ] 5.19 Open `firmware/vayu-unit/vayu-unit.ino` (File, Open).
- [ ] 5.20 Choose **Tools, Board, esp32, ESP32S3 Dev Module**, and set **USB CDC On Boot** to **Enabled**.
- [ ] 5.21 Connect the unit by USB and choose its port under **Tools, Port**.
- [ ] 5.22 Click the **tick** (Verify). Expected: `Done compiling`. This sketch has **not** been compiled before. If it shows errors, copy all the red text and send it to me.
- [ ] 5.23 Click the **arrow** (Upload). Expected: `Done uploading`.
- [ ] 5.24 Open **Tools, Serial Monitor**, and set the speed to **115200**.
- [ ] 5.25 Expected, every two seconds, a line like `PM1 … PM2.5 … flags 1 …`. At the start you will also see `flags 5` for the first 10 seconds (the sensor warming up).

### 5E. Test it

- [ ] 5.26 With nothing near the reader, watch the Serial Monitor. Expected: `flags` stays `1` (or `5` while warming up). The number `1` means "no tag".
- [ ] 5.27 Hold the tag against the reader. Within 2 to 3 seconds expect `flags` to become **`9`** (or `13` while warming up). The extra `8` means "on the purifier".
- [ ] 5.28 Take the tag away. Within about 3 to 5 seconds `flags` returns to `1` (the unit waits 3 seconds after the last read so one missed read does not flip it).
- [ ] 5.29 If `flags` never changes to 9, check in order: the wire colours against 5.11, the I2C switch positions, that the tag is within 2 cm, and that there is no metal behind the tag. Send me what the Serial Monitor shows when you hold the tag against the reader.

### 5F. Test it in the app

- [ ] 5.30 Open the app on the phone, **Your room**, and connect the unit (Part 4, steps 4.25 to 4.27).
- [ ] 5.31 Leave the unit in the room for 3 minutes (not on the purifier). Expected: normal room readings.
- [ ] 5.32 Switch the purifier on, and set the unit down on the tag. Within about 5 seconds expect a card titled **Purified air**, and a question **"Which purifier is this?"** with name buttons.
- [ ] 5.33 Tap a name (for example **Living room**) and **Save**. The question disappears and the name shows on the card.
- [ ] 5.34 Leave the unit on the purifier for 3 minutes. Expected: the card says **"The purifier makes the air N% cleaner than the room"**.
- [ ] 5.35 Check the room's own chart and readings did **not** jump to the purified numbers while the unit sat on the purifier. They should have stayed at the room level and simply stopped updating (the room reading may show as a few seconds old, which is expected).
- [ ] 5.36 Lift the unit off. Within about 5 seconds the **Purified air** card should go away and the room readings should resume.
- [ ] 5.37 Honest check: switch the purifier **off**, put the unit on it for 3 minutes, and look at the figure. Expect about **0%**. If it still says a large number with the purifier off, tell me; it means the reader or the comparison needs attention.

### What this part does not prove

A sensible percentage here shows the code and the wiring work together. It is not a measurement of the purifier's real performance: that needs the smoke-decay test described in `docs/PURIFIER.md`, and the unit's accuracy has not been compared with a reference monitor (`docs/UNIT.md`).

---

## When you are all done

- [ ] Part 1 done and checked (Harsh)
- [ ] Android app installed and Part 4 table returned (Aniket)
- [ ] iPhone app installed and Part 4 table returned (Harsh)
- [ ] Reader fitted and 5.26 to 5.37 passed (Aniket)
- [ ] Anything marked F sent back, with phone model and screenshot
