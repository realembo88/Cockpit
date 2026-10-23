"""Holt öffentliche Börsenkurse (GME, Dow Jones) serverseitig und schreibt kurse.json.
Läuft als GitHub Action; der Browser kann Yahoo/Stooq wegen CORS nicht direkt abfragen.
Enthält nur öffentliche Marktdaten, keine Bestände."""
import csv, io, json, sys, time, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/json,text/csv,*/*"}
SYMBOLE = {"GME": {"yahoo": "GME", "stooq": "gme.us", "range": "1mo"},
           "DJI": {"yahoo": "%5EDJI", "stooq": "%5Edji", "range": "1mo"}}

def holen(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def yahoo(sym, rng):
    for host in ("query1", "query2"):
        try:
            j = json.loads(holen("https://%s.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=%s" % (host, sym, rng)))
            res = j["chart"]["result"][0]; m = res["meta"]
            if not (m.get("regularMarketPrice") or 0) > 0: continue
            ts = res.get("timestamp") or []; cl = ((res.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
            hist = [[time.strftime("%Y-%m-%d", time.gmtime(t)), round(c, 3)] for t, c in zip(ts, cl) if isinstance(c, (int, float))]
            return {"price": m["regularMarketPrice"], "prev": m.get("chartPreviousClose") or m.get("previousClose"),
                    "t": m.get("regularMarketTime"), "hist": hist, "src": "Yahoo Finance"}
        except Exception as e:
            print("Yahoo", host, sym, "→", e, file=sys.stderr)
    return None

def stooq(sym):
    try:
        rows = list(csv.DictReader(io.StringIO(holen("https://stooq.com/q/l/?s=%s&f=sd2t2ohlc&h&e=csv" % sym))))
        c = float(rows[0]["Close"])
        if c > 0:
            return {"price": c, "prev": None, "t": None, "hist": [], "src": "Stooq", "datum": rows[0].get("Date")}
    except Exception as e:
        print("Stooq", sym, "→", e, file=sys.stderr)
    return None

def main(alt_pfad, neu_pfad):
    try: alt = json.load(open(alt_pfad))
    except Exception: alt = {}
    out = {"ts": int(time.time() * 1000)}; neu = 0
    for k, s in SYMBOLE.items():
        q = yahoo(s["yahoo"], s["range"]) or stooq(s["stooq"])
        if q: q["abruf"] = out["ts"]; out[k] = q; neu += 1
        elif k in alt: out[k] = alt[k]          # Ausfall: letzten Stand behalten (mit altem Abrufzeitpunkt)
    json.dump(out, open(neu_pfad, "w"), separators=(",", ":"))
    print("Kurse:", {k: (out[k].get("price"), out[k].get("src")) for k in SYMBOLE if k in out})
    return 0 if neu else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
