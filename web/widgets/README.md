# components/charts

Chart widgets for the web target: `ring`, `donut`, `spark`, `area` (multi-line, stacked, forecast, anomaly marks),
`dual` (two axes), `heat` (heat map with scale), `gantt` (timeline lanes), `bars`, `columns`, `dial` (gradient
gauge with configurable color stops and thresholds, e.g. temperature).

    <link rel="stylesheet" href="charts.css"><script src="charts.js"></script>
    Charts.ring(el, {value: 52, max: 100, sub: "util"});

Rule: a widget given no data (or a null point) renders a gap or renders "unavailable". It never invents a number. Widgets emit no branding.
Typical consumers: live monitoring dashboards, analytics pages, scheduling views.

## Themes
Widgets are theme-aware. Call `Charts.theme(tokens)` with the `tokens` object of any theme token collection
(the theme token collections); it sets CSS custom properties (`--accent`, `--success`, `--warning`, `--error`, `--muted`,
`--text`, `--series-0..7`, ...). Colours passed to widgets may be role names (`"accent"`, `"success"`, `"series3"`).
Re-render after switching themes. `Charts.color(role)` resolves a role to the active theme's colour.

## API
Every option each widget reads (checked against charts.js). `title` names the chart for assistive tech (SVG
`<title>`/`aria-label`); `empty` is the text shown instead of the chart when there is no usable data
(default "unavailable").

| widget | options |
|---|---|
| ring(el,o) | value, max, label, sub, unit, color, invert, stops[{at,color}] (fill colour follows the value), title |
| dial(el,o) | value, min, max, stops[{at,color}], thresholds[{at}], unit, label, sub, sweep, title, empty. A 270° gradient arc; the needle and value colour follow the value (default stops: temperature, red from 80) |
| donut(el,o) | segments[{label,value,color}], center, sub, legend, title |
| spark(el,o) | data[], color, min, max, title, empty |
| area(el,o) | series[{label,data,color}], stacked, fill, min, max, unit, forecast[], marks[] (indexes), yaxis (false hides y labels), time{t0,t1,now}, xticks[], xlabel, title, empty |
| dual(el,o) | a{label,data,color,unit}, b{label,data,color,unit}, time{t0,t1,now}, xticks[], xlabel, title, empty |
| heat(el,o) | rows[], cols[], values[][], min, max, unit, scale (false hides the scale), time{t0,t1,now}, xticks[], xlabel, title, empty |
| gantt(el,o) | lanes[{label,bars[{start,end,color,label}]}], t0, t1, now, title, empty (5 relative time ticks are drawn automatically) |
| bars(el,o) | items[{label,value,min,max,color,text}], empty. Signed domain; the zero baseline is always drawn |
| columns(el,o) | items[{label,value,color}], unit, empty. Signed domain; the zero baseline is always drawn |

`time.now` (seconds) is the reference for the relative tick labels ("-2m", "now"); it defaults to `t1`.

## Missing data and accessibility
- `null`/missing points are gaps in lines, areas, stacks, dual-axis series and the `area` forecast; they are never drawn as zero and never shifted. Forecast points keep their index (a null forecast point breaks the dashed line; the line joins history only when the first forecast point exists). Stacks refuse negative values (the chart shows unavailable).
- Every SVG chart has `role="img"`, a `<title>` and a `<desc>` text summary (last/min/max/gaps). Heat maps and timelines carry an `aria-label`.
- Theme roles used: `accent accent-dim accent2 accent3 success warning error muted text grid track unavail border raised series-0..7` (`seriesN` is accepted as an alias for `series-N`).

## Axes, tables, signed scales
- `area`/`dual`: y-axis labels at the gridlines (dual: left and right axes); pass `time: {t0, t1}` (seconds) for a
  labelled relative time axis with 5 ticks, or `xticks: [labels]`; `xlabel` names it.
- `heat` and `gantt`: a "Table" toggle shows a semantic table equivalent (caption, row/column headers); heat with
  `cols` labels gives a full matrix, otherwise min/mean/max/latest/gaps per row. `gantt` draws 5 time ticks.
- `bars` (`min`/`max` per item) and `columns` use a signed domain containing 0 with a visible zero baseline;
  negative values extend the other way, out-of-scale values are clipped and marked, missing ones say unavailable.

## Catalog registration
Each widget has a strict catalog descriptor in `catalog/widgets/visualization/`, so Studio, the headless Builder and
the MCP connector (`builder.command` catalog-count / catalog-entry / catalog-place) can list and place them:
`ring-gauge`, `dial-gauge`, `donut-chart`, `sparkline`, `dual-axis-chart`, `gantt-timeline-chart`,
`stacked-area-forecast-chart`, `heatmap-table-chart`, `signed-bar-chart`, `signed-column-chart`. Each descriptor's
`source_lineage.source_id` points to `components/charts/charts.js#<function>`. The `ai-ops.monitoring-wallboard`
template references all ten, so `template.search` / `page.compose` for a monitoring wallboard places them.
After you change charts.js, re-run `python3 components/charts/tools/register_catalog.py` (or add `--check` to see
what would change without writing anything). It refreshes the descriptors, their digests and the index rows.

## Build tools (`tools/`)
- `register_catalog.py`: the catalog registration above (idempotent, forward-only; `--check` writes nothing).
- `page_shots.py URL --pages a,b --sizes 1920x1080,2560x1440 --out DIR`: headless screenshots of every page and
  size (hash, query or path routing; `--storage key=value` presets localStorage, e.g. a theme). Exits 1 on page errors.
- `fit_check.py URL --pages a,b [--grid --card --body --allow-scroll]`: headless per-card fit check for tiled
  dashboards. It reports page scroll, card overlaps and per-card content overflow in px, and exits 1 on any failure.
- `widget_sync.py sync DEST_WEB [--strip WORD]` copies these widgets plus every theme token collection into a web
  project. `widget_sync.py zip SRC OUT.zip --exclude GLOB --forbid WORD` builds a clean zip and fails if any
  forbidden word appears in a file name or body.
Requires Python 3.8+; the two browser tools need `playwright` with Chromium (or Chrome). Both run headless only.
