# Test Scripts for MyMetrics

These scripts are for manual validation in Tauri mode (`npm run tauri:dev`).

## Success Cases

- `scalar_ok.py`
  - Card type: `scalar`
  - Expected: card shows value/unit/trend/color normally
- `series_ok.py`
  - Card type: `series`
  - Expected: chart renders x-axis + one or more lines
- `status_ok.py`
  - Card type: `status`
  - Expected: status card renders label/state/message
- `gauge_ok.py`
  - Card type: `gauge`
  - Expected: gauge card renders min/max/value(unit) with needle position

## Mapping Case

- `nested_payload.py`
  - Card type: `scalar`
  - Suggested mapping:
    - `value_key`: `metrics.cpu.value`
    - `unit_key`: `metrics.cpu.unit`
    - `trend_key`: `metrics.cpu.trend`
    - `color_key`: `metrics.cpu.color`
  - Expected: nested dot-path mapping works

## Error Cases

- `invalid_json.py`
  - Expected: execution fails with JSON parse error
- `wrong_type.py`
  - Create a card with type different from script output type
  - Expected: output type mismatch error
- `timeout_sleep.py --sleep 15`
  - Set card timeout `< 15000 ms` (for example `3000 ms`)
  - Expected: timeout error
- `stderr_nonzero.py`
  - Expected: execution fails and shows stderr / exit code

## Example Args

- `scalar_ok.py --value 78.9 --unit "%" --trend down --color warning --jitter 2 --seed 42`
- `series_ok.py --points 24 --step 0.5 --series-names cpu,mem,disk`
- `status_ok.py --label redis --state critical --message "replication lag high"`
- `gauge_ok.py --min 0 --max 100 --value 80 --unit "%" --jitter 2 --seed 7`
- `timeout_sleep.py --sleep 20`
- `wrong_type.py --actual-type status`
- `stderr_nonzero.py --code 3 --stderr "mock failure"`
