import { readConfig } from "./config.mjs";
const env = process.argv[2];
if (!["production", "staging"].includes(env))
  throw Error("staging or production required");
const config = await readConfig();
const target = config.env[env];
if (!target) throw Error("Environment missing");
const text = JSON.stringify(target);
if (/REPLACE|00000000-0000/.test(text))
  throw Error("Real independent domain and D1 IDs must be configured first");
if (/sysone\.top/.test(text))
  throw Error("User explicitly rejected the old domain");
if (target.vars.APP_ORIGIN !== process.env.APP_ORIGIN)
  throw Error("APP_ORIGIN differs between CI and Worker configuration");
console.log(env + " target configuration validated");
