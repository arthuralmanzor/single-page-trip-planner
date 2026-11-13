// The Forecast for the trip's Weather at point, from the Open-Meteo feed. No key and no sign-in.

const HOUR = 3600e3;

// What the page keeps of the feed's answer: each hour as [ms, temperature, chance of rain].
export function readForecast(json, point, fetchedAt) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const hours = h.time.map((t, i) => [t * 1000, h.temperature_2m[i], h.precipitation_probability[i]]);
  return { point, fetchedAt, hours };
}

export const forecastUrl = p => "https://api.open-meteo.com/v1/forecast"
  + `?latitude=${p.lat}&longitude=${p.lon}&hourly=temperature_2m,precipitation_probability&timeformat=unixtime&forecast_days=16`;

// The feed's forecast changes every few hours, so once an hour is plenty.
export const forecastDue = (fc, p, now) =>
  !fc || fc.point.lat !== p.lat || fc.point.lon !== p.lon || now - fc.fetchedAt >= HOUR;

// With no reception the page keeps showing the last forecast, for up to half a day.
const KEEP = 12 * HOUR;
const usable = (fc, now) => fc && now - fc.fetchedAt <= KEEP;

// The forecast for the hour nearest a moment, or null when the forecast doesn't reach it.
export function forecastAt(fc, ms, now) {
  if (!usable(fc, now)) return null;
  let best = null;
  for (const hr of fc.hours) if (!best || Math.abs(hr[0] - ms) < Math.abs(best[0] - ms)) best = hr;
  return best && Math.abs(best[0] - ms) <= HOUR / 2 ? { temp: best[1], rain: best[2] } : null;
}

// The lowest and highest temperature and the top chance of rain, from the hour nearest the
// day's first stop to the hour nearest its last.
export function dayOutlook(fc, from, to, now) {
  if (!usable(fc, now)) return null;
  const hours = fc.hours.filter(([t]) => t >= from - HOUR / 2 && t <= to + HOUR / 2);
  if (!hours.length) return null;
  const temps = hours.map(h => h[1]), rains = hours.map(h => h[2]).filter(r => r != null);
  return { low: Math.min(...temps), high: Math.max(...temps), rain: rains.length ? Math.max(...rains) : null };
}

export const forecastText = f => `${Math.round(f.temp)}°${f.rain == null ? "" : ` · ${f.rain}% rain`}`;
export const outlookText = o => `${Math.round(o.low)}° to ${Math.round(o.high)}°${o.rain == null ? "" : ` · rain up to ${o.rain}%`}`;

// The Hong Kong Observatory's warning summary. Its server turns away a request with headers of its
// own, so the page fetches it plainly.
export const WARNINGS_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en";
const RAIN = { WRAINA: "Amber", WRAINR: "Red", WRAINB: "Black" };

// The typhoon signal and the rainstorm warning in force, the ones that change a day's plan.
export function readWarnings(json, fetchedAt) {
  const inForce = w => w && w.actionCode !== "CANCEL" && w.code !== "CANCEL";
  const list = [];
  const tc = json && json.WTCSGNL, rain = json && json.WRAIN;
  const signal = inForce(tc) && /^TC(\d+)/.exec(tc.code);
  if (signal) list.push(`Typhoon signal ${signal[1]}`);
  if (inForce(rain) && RAIN[rain.code]) list.push(`${RAIN[rain.code]} rainstorm warning`);
  return { fetchedAt, list };
}

// A warning can end within the hour, so one checked more than three hours ago isn't shown.
export const warningsAt = (w, now) => w && now - w.fetchedAt <= 3 * HOUR ? w.list : [];
