For any "what did you learn" box, and for the last 20 seconds of the video.

**Make the rule smaller than the model.** The model only words an answer; fixed rules decide it, and every number in its wording is checked against the facts. I learned where that line was loose by failing: the guardrail blocked my own rewording instruction, and my number check let a masked name, `[person 1]`, through as the number 1. Both are fixed, and a test holds each.

**Read your own screenshots as a stranger would.** On 11 October my own screenshot showed AQI 500 beside "GRAP Stage II". The estimate had used the last 24 hours the monitor _had_, not the last 24 hours, and stretched one hour's PM10-to-PM2.5 ratio over the whole day. I fixed it, and checked it against the monitors' own PM10 on 24 station-days, with no day in the wrong stage. A number can be right and the sentence beside it wrong.

**Real AWS finds what tests do not.** A 403 from a forwarded Host header. A deploy that failed with a rollback that failed too. A bare Bedrock model id refused in ap-south-1. A schedule that stops without raising an error, so it now has an alarm on missing invocations.

**Price a thing before you cap it.** The guardrail is 98% of an assistant question's cost ($0.0008), so that is where the caps went: 40 questions a caller, 500 a day, and a switch that turns the model off.

**Hardware has its own bugs.** My sensor read fine until Bluetooth connected, then stopped measuring, most likely from a power dip. The firmware now restarts it on connect and after three failed reads.

**Say what you did not measure.** I measured the cleaner's airflow, 191 cfm, and not its CADR; I have not compared the unit with a monitor. So I keep a written list of what I do not claim, and why.
