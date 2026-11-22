// GitHub push events -> assets/habits.svg
// "When do I actually code?" Pushes per day, by hour of day and by weekday.
//
// Stands in for the lowlighter/metrics `habits` plugin, which crashes on
// GitHub's current event format. Only counts are drawn: no repo names, no
// commit messages, so private work stays private.
//
// Local test:  node habits.mjs --fixture events.json [--now 2026-11-20T12:00:00Z]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { COLOR, createTerminal } from "./term.mjs"

const root = new URL("../../", import.meta.url)
const me = JSON.parse(readFileSync(new URL("profile.json", root), "utf8"))
const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null)
const now = arg("--now") ? Date.parse(arg("--now")) : Date.now()

const MAX_EVENTS = 300 // GitHub serves at most 300 events...
const MAX_DAYS = 30 //    ...and nothing older than 30 days
const DAY = 86_400_000
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

async function fetchEvents() {
  if (arg("--fixture")) return JSON.parse(readFileSync(arg("--fixture"), "utf8"))
  const token = process.env.GH_TOKEN
  const events = []
  for (let page = 1; page <= MAX_EVENTS / 100; page++) {
    const res = await fetch(`https://api.github.com/users/${me.handle}/events?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `${me.handle}-profile`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (res.status === 422) break // asked for a page past the end
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const batch = await res.json()
    events.push(...batch)
    if (batch.length < 100) break
  }
  return events
}

// Everything below works in the profile's timezone, not the runner's (UTC).
const clockFormat = new Intl.DateTimeFormat("en-US", { timeZone: me.timezone, hour: "numeric", hourCycle: "h23", weekday: "short" })
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: me.timezone, year: "numeric", month: "2-digit", day: "2-digit" })
const stampFormat = new Intl.DateTimeFormat("en-GB", { timeZone: me.timezone, day: "numeric", month: "short", year: "numeric" })

function localClock(ms) {
  const parts = Object.fromEntries(clockFormat.formatToParts(ms).map(p => [p.type, p.value]))
  return { hour: Number(parts.hour) % 24, weekday: WEEKDAYS.indexOf(parts.weekday) }
}

// Calendar day as a running number, so two timestamps can be compared in whole days.
function localDay(ms) {
  const [y, m, d] = dateFormat.format(ms).split("-").map(Number)
  return Date.UTC(y, m - 1, d) / DAY
}

function summarize(events) {
  const today = localDay(now)
  const times = events.map(e => Date.parse(e.created_at)).filter(Number.isFinite)

  // If we hit the 300-event cap, the feed stops before 30 days. Only chart the
  // days it fully covers, so quiet-looking days are never just missing data.
  const capped = events.length >= MAX_EVENTS
  const window = capped ? Math.max(1, Math.min(MAX_DAYS, today - localDay(Math.min(...times)))) : MAX_DAYS

  const perDay = Array(window).fill(0) // index 0 = oldest day, last = today
  const hours = Array(24).fill(0)
  const weekdays = Array(7).fill(0)
  const repos = new Set()
  let total = 0

  for (const e of events) {
    if (e.type !== "PushEvent" || e.actor?.login?.toLowerCase() !== me.handle.toLowerCase()) continue
    const ms = Date.parse(e.created_at)
    const daysAgo = today - localDay(ms)
    if (!(daysAgo >= 0 && daysAgo < window)) continue
    const { hour, weekday } = localClock(ms)
    perDay[window - 1 - daysAgo]++
    hours[hour]++
    weekdays[weekday]++
    repos.add(e.repo?.name)
    total++
  }
  return { total, window, perDay, hours, weekdays, repos: repos.size, activeDays: perDay.filter(Boolean).length }
}

function draw({ total, window, perDay, hours, weekdays, repos, activeDays }) {
  const term = createTerminal({ width: 480, fontSize: 14, lineHeight: 19, padding: 12, user: me.handle })
  const { put, typed, appearAt, raw, x, top, baseline, ch, cols } = term
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const two = n => String(n).padStart(2, "0")

  let row = 0
  const typedAt = typed(row++, `git log --since=${window}.days | habits`, { promptAt: 0.2, typeAt: 0.45, perChar: 0.03 })
  const show = appearAt(typedAt + 0.15)
  row++

  if (!total) {
    put(row++, 0, `No pushes in the last ${count(window, "day", "days")}.`, { fill: COLOR.dim, cls: show })
    return term.render({ rows: row, title: "habits", label: `Coding habits: no pushes in the last ${count(window, "day", "days")}.` })
  }

  const right = (r, str, opts) => put(r, cols - str.length, str, opts)
  const heading = (title, note) => {
    put(row, 0, title, { bold: true, cls: show })
    right(row++, note, { fill: COLOR.green, cls: show })
  }

  // Vertical bar chart across the full width. `highlight` picks the green bar.
  let delay = typedAt + 0.25
  function columns(values, chartRows, highlight) {
    const slot = (cols * ch) / values.length
    const gap = Math.min(4, slot * 0.3)
    const height = chartRows * 19 - 6
    const floor = top(row + chartRows) - 4
    const max = Math.max(...values)
    values.forEach((n, i) => {
      const h = Math.max(2, (n / max) * height)
      raw(
        `<g class="${show}"><rect class="bar" style="animation-delay:${(delay + i * 0.015).toFixed(2)}s" x="${(x(0) + i * slot + gap / 2).toFixed(2)}" y="${(floor - h).toFixed(2)}" width="${(slot - gap).toFixed(2)}" height="${h.toFixed(2)}" rx="1.5" fill="${i === highlight ? COLOR.green : COLOR.dim}"${n ? "" : ' opacity=".35"'}/></g>`,
      )
    })
    delay += 0.3
    row += chartRows
    return slot
  }

  // Pushes per day
  heading("PUSHES PER DAY", `active ${activeDays} of ${count(window, "day", "days")}`)
  columns(perDay, 4, -1)
  put(row, 0, `${window - 1}d ago`, { fill: COLOR.dim, cls: show })
  right(row++, "today", { fill: COLOR.dim, cls: show })
  row++

  // Pushes by hour
  const peakHour = hours.indexOf(Math.max(...hours))
  heading(`PUSHES BY HOUR (${me.timezoneLabel})`, `peak ${two(peakHour)}:00`)
  const slot = columns(hours, 4, peakHour)
  for (const h of [0, 6, 12, 18]) {
    raw(`<g class="${show}"><text x="${(x(0) + h * slot + 2).toFixed(2)}" y="${baseline(row)}" fill="${COLOR.dim}">${two(h)}</text></g>`)
  }
  right(row++, "23", { fill: COLOR.dim, cls: show })
  row++

  // Pushes by weekday
  const peakDay = weekdays.indexOf(Math.max(...weekdays))
  heading("PUSHES BY WEEKDAY", `peak ${WEEKDAYS[peakDay]}`)
  const barStart = 5
  const barWidth = (cols - barStart - 5) * ch
  weekdays.forEach((n, d) => {
    const isPeak = d === peakDay
    put(row, 0, WEEKDAYS[d], { fill: isPeak ? COLOR.text : COLOR.dim, cls: show })
    raw(
      `<g class="${show}"><rect class="hbar" style="animation-delay:${(delay + d * 0.05).toFixed(2)}s" x="${x(barStart)}" y="${top(row) + 4}" width="${Math.max(2, (n / weekdays[peakDay]) * barWidth).toFixed(2)}" height="11" rx="1.5" fill="${isPeak ? COLOR.green : COLOR.dim}"${n ? "" : ' opacity=".35"'}/></g>`,
    )
    right(row++, String(n), { fill: isPeak ? COLOR.text : COLOR.dim, cls: show })
  })
  row++

  put(row, 0, `${count(total, "push", "pushes")} to ${count(repos, "repo", "repos")}`, { fill: COLOR.dim, cls: show })
  right(row++, `as of ${stampFormat.format(now)}`, { fill: COLOR.dim, cls: show })

  const label = `Coding habits over the last ${count(window, "day", "days")}: ${count(total, "push", "pushes")} to ${count(repos, "repository", "repositories")}, active on ${activeDays} of those days. Most active around ${two(peakHour)}:00 ${me.timezoneLabel}, and on ${WEEKDAYS[peakDay]}.`
  return term.render({ rows: row, title: "habits", label })
}

const summary = summarize(await fetchEvents())
mkdirSync(new URL("assets/", root), { recursive: true })
writeFileSync(new URL("assets/habits.svg", root), draw(summary))
console.log(`assets/habits.svg written (${summary.total} pushes, ${summary.repos} repos, ${summary.window}-day window)`)
