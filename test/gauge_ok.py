#!/usr/bin/env python3
import argparse
import json
import random


def main() -> None:
    parser = argparse.ArgumentParser(description="Emit a valid gauge payload for MyMetrics.")
    parser.add_argument("--min", dest="min_value", type=float, default=0.0, help="Gauge minimum")
    parser.add_argument("--max", dest="max_value", type=float, default=100.0, help="Gauge maximum")
    parser.add_argument("--value", type=float, default=80.0, help="Gauge current value")
    parser.add_argument("--unit", default="%", help="Gauge unit")
    parser.add_argument("--jitter", type=float, default=0.0, help="Random +/- jitter for value")
    parser.add_argument("--seed", type=int, default=None, help="Optional random seed")
    parser.add_argument(
        "--no-clamp",
        action="store_true",
        help="Do not clamp value into [min, max] range",
    )
    args = parser.parse_args()

    if args.max_value <= args.min_value:
        parser.error("--max must be greater than --min")

    if args.seed is not None:
        random.seed(args.seed)

    value = args.value
    if args.jitter > 0:
        value += random.uniform(-args.jitter, args.jitter)

    if not args.no_clamp:
        value = max(args.min_value, min(args.max_value, value))

    payload = {
        "type": "gauge",
        "data": {
            "min": round(args.min_value, 2),
            "max": round(args.max_value, 2),
            "value": round(value, 2),
            "unit": args.unit,
        },
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
