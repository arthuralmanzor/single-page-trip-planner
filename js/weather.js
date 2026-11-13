// The Forecast for the trip's Weather at point, from the Open-Meteo feed. No key and no sign-in.

const HOUR = 3600e3;

// What the page keeps of the feed's answer: each hour as
// [ms, temperature, chance of rain, WMO weather code, 1 by day or 0 by night].
export function readForecast(json, point, fetchedAt) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const at = (list, i) => (list && list[i] != null ? list[i] : null);
  const hours = h.time.map((t, i) => [t * 1000, h.temperature_2m[i], at(h.precipitation_probability, i), at(h.weather_code, i), at(h.is_day, i)]);
  return { point, fetchedAt, hours };
}

export const forecastUrl = point => "https://api.open-meteo.com/v1/forecast"
  + `?latitude=${point.lat}&longitude=${point.lon}&hourly=temperature_2m,precipitation_probability,weather_code,is_day&timeformat=unixtime&forecast_days=16`;

// The feed's forecast changes every few hours, so once an hour is plenty.
export const forecastDue = (fc, point, now) =>
  !fc || fc.point.lat !== point.lat || fc.point.lon !== point.lon || now - fc.fetchedAt >= HOUR;

// With no reception the page keeps showing the last forecast, for up to half a day.
const KEEP = 12 * HOUR;
const usable = (fc, now) => fc && now - fc.fetchedAt <= KEEP;

// When the shown forecast is from, once it has missed a refresh. Null while it's on time.
export const asOf = (fc, now) => fc && now - fc.fetchedAt > 1.5 * HOUR ? fc.fetchedAt : null;

// The forecast for the hour nearest a moment, or null when the forecast doesn't reach it.
export function forecastAt(fc, ms, now) {
  if (!usable(fc, now)) return null;
  let best = null;
  for (const hr of fc.hours) if (!best || Math.abs(hr[0] - ms) < Math.abs(best[0] - ms)) best = hr;
  return best && Math.abs(best[0] - ms) <= HOUR / 2 ? { temp: best[1], rain: best[2], code: best[3], day: best[4] !== 0 } : null;
}

// The icon for an hour's forecast. What changes the family's plans comes first: a storm or rain,
// then heat or cold, then the sky. The feed's weather codes are WMO's.
export function forecastIcon(f) {
  const { code, rain, day } = f, temp = Math.round(f.temp);
  if (code == null) return null;
  if (code >= 95) return "storm";
  if (rain >= 50 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (temp >= 33) return "hot";
  if (temp <= 12 || (code >= 71 && code <= 77) || code === 85 || code === 86) return "cold";
  if (code === 45 || code === 48) return "fog";
  if (code === 3 || (code === 2 && !day)) return "cloud";
  if (code === 2) return "sun-cloud";
  return day ? "sun" : "moon";
}

// The lowest and highest temperature and the top chance of rain, from the hour nearest the
// day's first stop to the hour nearest its last.
export function dayForecast(fc, from, to, now) {
  if (!usable(fc, now)) return null;
  const hours = fc.hours.filter(([t]) => t >= from - HOUR / 2 && t <= to + HOUR / 2);
  if (!hours.length) return null;
  const temps = hours.map(h => h[1]), rains = hours.map(h => h[2]).filter(r => r != null);
  return { low: Math.min(...temps), high: Math.max(...temps), rain: rains.length ? Math.max(...rains) : null };
}

export const forecastText = f => `${Math.round(f.temp)}°${f.rain == null ? "" : ` · ${f.rain}% rain`}`;
export const dayForecastText = day => `${Math.round(day.low)}° to ${Math.round(day.high)}°${day.rain == null ? "" : ` · rain up to ${day.rain}%`}`;

// The Hong Kong Observatory's warning summary. Its server turns away a request with headers of its
// own, so the page fetches it plainly.
export const WARNINGS_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en";
const RAIN = { WRAINA: "Amber", WRAINR: "Red", WRAINB: "Black" };

// The typhoon signal and the rainstorm warning in force, the ones that change a day's plan.
export function readWarnings(json, fetchedAt) {
  const inForce = w => w && w.actionCode !== "CANCEL" && w.code !== "CANCEL";
  const list = [];
  const tc = json && json.WTCSGNL, rain = json && json.WRAIN;
  const typhoon = inForce(tc) && /^TC(\d+)/.exec(tc.code);
  if (typhoon) list.push(`Typhoon signal ${typhoon[1]}`);
  if (inForce(rain) && RAIN[rain.code]) list.push(`${RAIN[rain.code]} rainstorm warning`);
  return { fetchedAt, list };
}

// The Observatory's warnings cover Hong Kong only, and the Weather at row turns all weather on.
export const hasWarnings = trip => !!trip.weatherAt && trip.timeZone === "Asia/Hong_Kong";

// With no reception the warnings stay up with their time, for as long as the forecast does.
export const warningsAt = (w, now) => w && now - w.fetchedAt <= KEEP ? w.list : [];
