#!/usr/bin/env python3
"""Runs every browser test against the built apps and prints a summary.

    python3 tools/e2e/run.py              all suites
    python3 tools/e2e/run.py phone        only the phone app
    python3 tools/e2e/run.py desktop      only the desktop UI
    python3 tools/e2e/run.py phone_native one suite by name

Needs Python 3.9+, `pip install playwright pillow`, and a Chromium for Playwright
(`playwright install chromium`). Screenshots land in tools/e2e/out/ (git-ignored).
"""
import pathlib, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / "out"
SUITES = ["desktop_explore", "desktop_pages", "desktop_offline", "phone_explore", "phone_pages", "phone_native", "phone_sizes"]

def main(argv):
    wanted = argv[1:] or ["all"]
    chosen = [s for s in SUITES if "all" in wanted or s in wanted or s.split("_")[0] in wanted]
    if not chosen:
        print("No suite matches", wanted, "- choose from", ", ".join(SUITES), "or desktop / phone / all")
        return 2
    print("Building both apps...")
    subprocess.run(["node", str(ROOT / "scripts" / "build.mjs"), "all"], check=True, cwd=ROOT)
    OUT.mkdir(exist_ok=True)
    failed = []
    for name in chosen:
        print(f"\n=== {name}", flush=True)
        started = time.time()
        code = subprocess.run([sys.executable, str(HERE / f"{name}.py")], cwd=OUT).returncode
        print(f"--- {name}: {'passed' if code == 0 else 'FAILED'} in {time.time() - started:.0f}s")
        if code != 0:
            failed.append(name)
    print("\n" + ("All browser suites passed." if not failed else "Failed: " + ", ".join(failed)))
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
