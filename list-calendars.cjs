const { AcuityProvider } = require('./src/lib/calendar/acuity-provider');

(async () => {
  const p = new AcuityProvider();
  const calendars = await p.getCalendars();
  console.log(JSON.stringify(calendars, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
