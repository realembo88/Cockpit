"""Turtle-Breakout (Variante aus dem Rallio-Video): Kurse holen, Level berechnen, bei Ereignissen per ntfy pushen.

Läuft als GitHub Action (stündlich) und schreibt turtle.json in den Zweig "turtle".
Enthält nur öffentliche Marktdaten – Kontostand, Positionen und Stückzahlen bleiben im privaten Daten-Repo
und werden erst im Browser (turtle/logic.js) verrechnet.

Regeln (Standard, wie im Video):
  Einstieg   Kurs steigt über das höchste Hoch der letzten 20 Handelstage (nur long)
  Fester Stop  Einstieg − 2 × ATR(20), bewegt sich nie
  Trailing   tiefstes Tief der letzten 10 Handelstage, täglich neu
  Ausstieg   der höhere (nähere) der beiden Stops wird berührt; kein Take-Profit
  Handelstag endet um 17:00 New Yorker Zeit (Stundenkerzen werden darauf umgerechnet)

Aufruf:  python3 turtle.py <alt.json> <neu.json>
Umgebung: NTFY_TOPIC (leer = kein Push), NTFY_SERVER (Standard https://ntfy.sh), NTFY_TOKEN (optional),
          TURTLE_TAGESHANDEL=1 (Erinnerung an die Tageshandel-Variante im Order-Zettel)
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
BER = ZoneInfo("Europe/Berlin")
# Ehrliche Kennung: mit einem vorgetäuschten Browser-Kennzeichner antwortet Yahoo von GitHub aus mit 429
UA = {"User-Agent": "cockpit-turtle/1.0 (+https://github.com/realembo88/Cockpit)", "Accept": "application/json,*/*"}
ASSETS = [
    {"id": "spx", "name": "S&P 500", "yahoo": "ES=F", "cnbc": "@SP.1", "futures": True},
    {"id": "ndx", "name": "Nasdaq 100", "yahoo": "NQ=F", "cnbc": "@ND.1", "futures": True},
    {"id": "gold", "name": "Gold", "yahoo": "GC=F", "cnbc": "@GC.1", "futures": True},
    {"id": "silver", "name": "Silber", "yahoo": "SI=F", "cnbc": "@SI.1", "futures": True},
    {"id": "btc", "name": "Bitcoin", "yahoo": "BTC-USD", "futures": False},
]
PARAM = {"entry": 20, "exit": 10, "atr": 20, "mult": 2.0}
KEEP = 260                     # so viele abgeschlossene Handelstage gehen ins JSON
DASHBOARD = "https://realembo88.github.io/Cockpit/turtle/"
TREND_SEITE = "https://realembo88.github.io/Cockpit/trend/"

# Trendfilter (Monats-Regel): investiert sein, solange der Monatsschluss über dem Schnitt der letzten 10 Monatsschlüsse liegt.
# Eigene Liste per Repo-Variable TREND_SYMBOLE, z. B. "EUNL.DE=MSCI World;4GLD.DE=Gold" (Yahoo-Kürzel=Name).
TREND = [
    {"id": "EUNL.DE", "name": "MSCI World", "produkt": "iShares Core MSCI World", "isin": "IE00B4L5Y983"},
    {"id": "SXR8.DE", "name": "S&P 500", "produkt": "iShares Core S&P 500", "isin": "IE00B5BMR087"},
    {"id": "SXRV.DE", "name": "Nasdaq 100", "produkt": "iShares Nasdaq 100", "isin": "IE00B53SZB19"},
    {"id": "4GLD.DE", "name": "Gold", "produkt": "Xetra-Gold", "isin": "DE000A0S9GB0"},
    {"id": "BTC-EUR", "name": "Bitcoin", "produkt": "Bitcoin in Euro (Signal für ein Bitcoin-ETN)", "isin": ""},
]
TREND_N = 10
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def warn(*a):
    print("::warning::" + " ".join(str(x) for x in a)[:300])


def holen(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=dict(UA, **(headers or {})))
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


# ---------------- Kurse ----------------
def yahoo(sym, interval, rng):
    s = urllib.parse.quote(sym, safe="")
    for host in ("query1", "query2"):
        try:
            time.sleep(1.5)                     # kurze Pause – zu schnelle Abfragen beantwortet Yahoo mit 429
            j = json.loads(holen("https://%s.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s" % (host, s, interval, rng)))
            res = j["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            bars = [(t, o, h, l, c) for t, o, h, l, c in zip(res.get("timestamp") or [], q["open"], q["high"], q["low"], q["close"])
                    if None not in (o, h, l, c)]
            if bars:
                return bars, res.get("meta") or {}
            warn("Yahoo", host, sym, interval, "→ keine Kerzen")
        except Exception as e:
            warn("Yahoo", host, sym, interval, "→", e)
    return None, {}


def cnbc_bars(sym):
    """Ersatz für Futures: Stundenkerzen von CNBC (fortlaufender Kontrakt, z. B. @SP.1; liefert gut drei Monate)."""
    try:
        von = (datetime.now(NY) - timedelta(days=380)).strftime("%Y%m%d000000")
        bis = datetime.now(NY).strftime("%Y%m%d%H%M%S")
        j = json.loads(holen("https://ts-api.cnbc.com/harmony/app/bars/%s/1H/%s/%s/adjusted/EST5EDT.json" % (
            urllib.parse.quote(sym, safe=""), von, bis)))
        bars = []
        for b in (j.get("barData") or {}).get("priceBars") or []:
            if b.get("tradeTimeinMills"):
                bars.append((int(b["tradeTimeinMills"]) // 1000,) + tuple(float(b[k]) for k in ("open", "high", "low", "close")))
        if len(bars) > 24 * 40:
            return bars, {"regularMarketPrice": bars[-1][4]}
        warn("CNBC", sym, "→ zu wenige Kerzen:", len(bars))
    except Exception as e:
        warn("CNBC", sym, "→", e)
    return None, {}


def coinbase_btc(tage=380):
    """Ersatz für Bitcoin: Stundenkerzen von Coinbase (je Abruf höchstens 300 Stunden)."""
    bars, ende = [], int(time.time()) // 3600 * 3600 + 3600
    try:
        while ende > time.time() - tage * 86400:
            start = ende - 300 * 3600
            u = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=%s&end=%s" % (
                datetime.fromtimestamp(start, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                datetime.fromtimestamp(ende, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
            for t, lo, hi, op, cl, _v in json.loads(holen(u)):
                bars.append((int(t), op, hi, lo, cl))
            ende = start
            time.sleep(0.4)
    except Exception as e:
        warn("Coinbase →", e)
    bars = sorted(set(bars))
    return (bars, {"regularMarketPrice": bars[-1][4]}) if len(bars) > 24 * 40 else (None, {})


def eurusd_ezb():
    """Euro-Referenzkurs der EZB über frankfurter.dev."""
    for u in ("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", "https://api.frankfurter.app/latest?from=EUR&to=USD"):
        try:
            v = json.loads(holen(u))["rates"]["USD"]
            if v > 0:
                return v
        except Exception as e:
            warn("Frankfurter →", e)
    return None


def session_key(ts):
    """Handelstag, der um 17:00 New Yorker Zeit endet (Kerze ab 17:00 zählt zum Folgetag)."""
    return (datetime.fromtimestamp(ts, NY) + timedelta(hours=7)).date()


def session_end(d):
    return datetime(d.year, d.month, d.day, 17, 0, tzinfo=NY)


def to_sessions(bars):
    out = {}
    for t, o, h, l, c in sorted(bars):
        k = session_key(t)
        s = out.get(k)
        if s is None:
            out[k] = [o, h, l, c]
        else:
            s[1] = max(s[1], h); s[2] = min(s[2], l); s[3] = c
    return [[k.isoformat()] + v for k, v in sorted(out.items())]


# ---------------- Regeln (gleich wie turtle/logic.js) ----------------
def atr_series(S, n):
    tr, out, a = [], [], None
    for i, (_, o, h, l, c) in enumerate(S):
        tr.append(h - l if i == 0 else max(h - l, abs(h - S[i - 1][4]), abs(l - S[i - 1][4])))
        if i == n - 1:
            a = sum(tr[:n]) / n
        elif i >= n:
            a = (a * (n - 1) + tr[i]) / n
        out.append(a)
    return out


def levels(S, atr, i, p):
    """Level für Handelstag i – nur aus den Tagen davor berechnet."""
    up = max(x[2] for x in S[i - p["entry"]:i])
    trail = min(x[3] for x in S[i - p["exit"]:i])
    return up, trail, atr[i - 1]


def simulate(S, p=PARAM):
    atr = atr_series(S, p["atr"])
    trades, pos = [], None
    start = max(p["entry"], p["exit"], p["atr"])

    def close(d, px, stop_fixed):
        risk = pos["entry"] - pos["fixed"]
        trades.append(dict(pos, out=d, exit=px, why="fest" if stop_fixed else "trailing", r=(px - pos["entry"]) / risk if risk > 0 else 0))

    for i in range(start, len(S)):
        d, o, h, l, c = S[i]
        up, trail, a = levels(S, atr, i, p)
        if pos is None:
            if h > up:
                e = max(o, up)
                pos = {"in": d, "entry": e, "fixed": e - p["mult"] * a, "atr": a}
                stop = max(pos["fixed"], trail)
                if l <= stop:                       # Stop am Einstiegstag (ungünstigster Fall)
                    close(d, stop, stop == pos["fixed"]); pos = None
        else:
            stop = max(pos["fixed"], trail)
            if o <= stop:
                close(d, o, stop == pos["fixed"]); pos = None
            elif l <= stop:
                close(d, stop, stop == pos["fixed"]); pos = None
    return trades, pos, atr


def analyse(C, P, p=PARAM):
    """C = abgeschlossene Handelstage, P = laufender Handelstag (oder None)."""
    if len(C) <= max(p["entry"], p["exit"], p["atr"]):
        return None
    trades, pos, atr = simulate(C, p)
    up, trail, a = levels(C + [None], atr + [None], len(C), p)   # Level für den nächsten Handelstag
    nxt = {"up": up, "trail": trail, "atr": a, "fixedIfEntry": up - p["mult"] * a}
    if pos:
        pos = dict(pos, stop=max(pos["fixed"], trail), stopArt="fest" if pos["fixed"] >= trail else "trailing")
    heute = None
    if P:
        if pos is None and P[2] > up:
            heute = {"art": "einstieg", "px": max(P[1], up)}
        elif pos is not None and P[3] <= pos["stop"]:
            heute = {"art": "stop", "px": min(P[1], pos["stop"])}
    return {"next": nxt, "pos": pos, "heute": heute, "trades": trades[-30:]}


# ---------------- Ausgabe ----------------
def rnd(x):
    if x is None:
        return None
    return round(x, 2 if abs(x) >= 100 else 4)


def rnd_obj(o):
    if isinstance(o, float):
        return rnd(o)
    if isinstance(o, dict):
        return {k: rnd_obj(v) for k, v in o.items()}
    if isinstance(o, list):
        return [rnd_obj(v) for v in o]
    return o


def de(x, d=None):
    if x is None:
        return "–"
    if d is None:
        d = 2 if abs(x) < 1000 else 1 if abs(x) < 20000 else 0
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def dde(iso):
    d = date.fromisoformat(iso)
    return "%s %02d.%02d." % (WT[d.weekday()], d.day, d.month)


def next_session(last_iso, futures):
    d = date.fromisoformat(last_iso) + timedelta(days=1)
    while futures and d.weekday() >= 5:
        d += timedelta(days=1)
    return d.isoformat()


def ber_zeit(iso, hh, mm):
    d = date.fromisoformat(iso)
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=NY).astimezone(BER).strftime("%H:%M")


def zettel(out, tageshandel):
    """Täglicher Order-Zettel nach Handelsschluss (17:00 NY)."""
    fut = [a for a in ASSETS if a["futures"] and out["assets"].get(a["id"], {}).get("ana")]
    if not fut:
        return None
    last = max(out["assets"][a["id"]]["sessions"][-1][0] for a in fut)
    nxt = next_session(last, True)
    zeilen = []
    for a in ASSETS:
        x = out["assets"].get(a["id"])
        if not x or not x.get("ana"):
            zeilen.append("%s: keine Daten" % a["name"]); continue
        an = x["ana"]; n = an["next"]; pos = an["pos"]
        t = an["trades"][-1] if an["trades"] else None
        if t and t["out"] == x["sessions"][-1][0]:
            zeilen.append("%s: Trade geschlossen bei %s (%s-Stop, %s R)" % (a["name"], de(t["exit"]), t["why"], de(t["r"], 1)))
        if pos:
            zeilen.append("%s: IM TRADE seit %s, Einstieg %s · Stop jetzt %s (%s)" % (
                a["name"], dde(pos["in"]), de(pos["entry"]), de(pos["stop"]), "fest" if pos["stopArt"] == "fest" else "Trailing"))
        else:
            zeilen.append("%s: Buy-Stop über %s · Stop dann %s (ATR %s)" % (a["name"], de(n["up"]), de(n["fixedIfEntry"]), de(n["atr"])))
    zeilen.append("Stückzahlen und Risiko im Cockpit.")
    if tageshandel:
        zeilen.append("Tageshandel: offene Positionen um %s Uhr schließen, ab %s Uhr wieder rein, wenn über Stop." % (
            ber_zeit(nxt, 16, 30), ber_zeit(nxt, 18, 0)))
    return {"title": "Turtle · Order-Zettel für " + dde(nxt), "message": "\n".join(zeilen), "tags": ["turtle"], "key": "zettel:" + last}


def ereignisse(out):
    ev = []
    for a in ASSETS:
        x = out["assets"].get(a["id"])
        if not x or not x.get("ana") or not x["ana"]["heute"] or not x.get("partial"):
            continue
        h = x["ana"]["heute"]; n = x["ana"]["next"]; pos = x["ana"]["pos"]; tag = x["partial"][0]
        if h["art"] == "einstieg":
            ev.append({"title": "Turtle · %s: Breakout" % a["name"],
                       "message": "Kurs über dem 20-Tage-Hoch %s (aktuell %s). Einstieg laut Regel bei %s, fester Stop %s." % (
                           de(n["up"]), de(x["price"]), de(h["px"]), de(n["fixedIfEntry"])),
                       "tags": ["turtle", "chart_with_upwards_trend"], "priority": 4, "key": "%s:%s:einstieg" % (a["id"], tag)})
        else:
            ev.append({"title": "Turtle · %s: Stop berührt" % a["name"],
                       "message": "Kurs hat den Stop %s erreicht (aktuell %s). Position laut Regel geschlossen – prüfe, ob deine Stop-Order ausgeführt wurde." % (
                           de(pos["stop"]), de(x["price"])),
                       "tags": ["turtle", "rotating_light"], "priority": 4, "key": "%s:%s:stop" % (a["id"], tag)})
    return ev


def ntfy(msg):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return False
    server = (os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh").rstrip("/")
    body = {"topic": topic, "title": msg["title"], "message": msg["message"], "tags": msg.get("tags", []),
            "priority": msg.get("priority", 3), "click": msg.get("click", DASHBOARD)}
    hd = {"Content-Type": "application/json"}
    if os.environ.get("NTFY_TOKEN"):
        hd["Authorization"] = "Bearer " + os.environ["NTFY_TOKEN"].strip()
    try:
        holen(server, json.dumps(body).encode("utf-8"), hd)
        return True
    except Exception as e:
        warn("ntfy →", e)
        return False


def trend_liste():
    roh = os.environ.get("TREND_SYMBOLE", "").strip()
    if not roh:
        return TREND
    out = []
    for teil in roh.split(";"):
        if "=" in teil:
            sym, name = [x.strip() for x in teil.split("=", 1)]
            if sym:
                out.append({"id": sym, "name": name or sym, "produkt": name or sym, "isin": ""})
    return out or TREND


def monatsschluesse(bars, jetzt):
    """Monatskerzen → [[JJJJ-MM, Schluss], …] abgeschlossen, dazu der laufende Monat (oder None)."""
    m = {}
    for t, o, h, l, c in sorted(bars):
        ym = datetime.fromtimestamp(t + 43200, timezone.utc).strftime("%Y-%m")   # +12 h: Monatsanfang in Ortszeit sauber treffen
        m[ym] = c
    lauf = jetzt.astimezone(BER).strftime("%Y-%m")
    fertig = [[k, v] for k, v in sorted(m.items()) if k < lauf]
    return fertig[-120:], ([lauf, m[lauf]] if lauf in m else None)


def trend_signal(monate, n=TREND_N):
    if len(monate) < n:
        return None
    schnitt = sum(c for _, c in monate[-n:]) / n
    vor = sum(c for _, c in monate[-n - 1:-1]) / n if len(monate) > n else None
    return {"monat": monate[-1][0], "schluss": monate[-1][1], "schnitt": schnitt, "drin": monate[-1][1] > schnitt,
            "vorher": (monate[-2][1] > vor) if vor is not None else None}


def trend_daten(alt, jetzt):
    """Höchstens alle 6 Stunden neu laden – Monatsdaten ändern sich langsam."""
    a = alt.get("trend") or {}
    if a.get("ts") and jetzt.timestamp() * 1000 - a["ts"] < 6 * 3600e3 and set(a.get("werte", {})) == {x["id"] for x in trend_liste()}:
        return a
    werte = {}
    for x in trend_liste():
        bars, meta = yahoo(x["id"], "1mo", "10y")
        if not bars:
            if (a.get("werte") or {}).get(x["id"]):
                werte[x["id"]] = dict(a["werte"][x["id"]], veraltet=True)
            continue
        fertig, lauf = monatsschluesse(bars, jetzt)
        werte[x["id"]] = rnd_obj({"name": x["name"], "produkt": x["produkt"], "isin": x["isin"], "monate": fertig, "lauf": lauf,
                                  "price": meta.get("regularMarketPrice") or (lauf or fertig[-1])[1], "waehrung": meta.get("currency") or "EUR"})
    return {"ts": int(jetzt.timestamp() * 1000), "n": TREND_N, "werte": werte}


def trend_check(trend, jetzt):
    """Monats-Check: ab 8 Uhr am ersten Tag nach Monatsende, einmal je Monat."""
    if jetzt.astimezone(BER).hour < 8 or not trend.get("werte"):
        return None
    zeilen, monat = [], None
    for x in trend_liste():
        w = trend["werte"].get(x["id"])
        sig = trend_signal(w["monate"]) if w and not w.get("veraltet") else None
        if not sig:
            zeilen.append("%s: keine Daten" % x["name"]); continue
        monat = max(monat or "", sig["monat"])
        abst = (sig["schluss"] / sig["schnitt"] - 1) * 100
        wechsel = sig["vorher"] is not None and sig["vorher"] != sig["drin"]
        zeilen.append("%s: %s (%s%s %% zum 10-Monats-Schnitt)%s" % (
            x["name"], "INVESTIERT SEIN" if sig["drin"] else "RAUS / Cash", "+" if abst >= 0 else "−", de(abs(abst), 1),
            " ← WECHSEL: jetzt " + ("kaufen" if sig["drin"] else "verkaufen") if wechsel else ""))
    if not monat:
        return None
    zeilen.append("Ohne Wechsel: nichts tun. Sparplan nur in ETFs mit Signal „investiert“.")
    return {"title": "Trendfilter · Monats-Check %s" % MONATE[int(monat[5:7]) - 1], "message": "\n".join(zeilen),
            "tags": ["calendar"], "key": "trend:" + monat, "click": TREND_SEITE}


def main(alt_pfad, neu_pfad, jetzt=None):
    try:
        alt = json.load(open(alt_pfad))
    except Exception:
        alt = {}
    jetzt = jetzt or datetime.now(timezone.utc)
    out = {"ver": 1, "ts": int(jetzt.timestamp() * 1000), "param": PARAM, "assets": {}}
    for a in ASSETS:
        bars, meta = yahoo(a["yahoo"], "60m", "1y")
        quelle = "Yahoo Finance · Stundenkerzen → Handelstag bis 17:00 New York"
        if not bars and a.get("cnbc"):
            bars, meta = cnbc_bars(a["cnbc"])
            quelle = "CNBC · Stundenkerzen → Handelstag bis 17:00 New York (Ersatz)"
        if not bars and a["id"] == "btc":
            bars, meta = coinbase_btc()
            quelle = "Coinbase · Stundenkerzen → Handelstag bis 17:00 New York (Ersatz)"
        if not bars:
            if alt.get("assets", {}).get(a["id"]):       # letzten Stand behalten, aber als alt markieren
                out["assets"][a["id"]] = dict(alt["assets"][a["id"]], veraltet=True)
            continue
        S = to_sessions(bars)
        partial = None
        if S and jetzt < session_end(date.fromisoformat(S[-1][0])):
            partial = S.pop()
        S = S[-KEEP:]                                   # Browser rechnet mit denselben Tagen → gleiche Ergebnisse
        price = meta.get("regularMarketPrice") or (partial or S[-1])[4]
        x = {"name": a["name"], "src": a["yahoo"], "quelle": quelle, "price": price, "t": meta.get("regularMarketTime"),
             "sessions": S, "partial": partial}
        x["ana"] = analyse(S, partial)
        out["assets"][a["id"]] = rnd_obj(x)
    try:
        out["trend"] = trend_daten(alt, jetzt)
    except Exception as e:
        warn("Trendfilter →", e)
        if alt.get("trend"):
            out["trend"] = alt["trend"]
    fx = eurusd_ezb()
    if fx:
        out["eurusd"] = round(fx, 5)
    elif alt.get("eurusd"):
        out["eurusd"] = alt["eurusd"]

    # Push: einmal täglich der Order-Zettel, dazu Breakouts/Stops während des Tages – jedes Ereignis nur einmal
    gemeldet = {k: v for k, v in (alt.get("gemeldet") or {}).items() if v > out["ts"] - 14 * 864e5}
    msgs = []
    z = zettel(out, os.environ.get("TURTLE_TAGESHANDEL", "").strip() in ("1", "true", "ja"))
    if z and z["key"] not in gemeldet:
        msgs.append(z)
    msgs += [e for e in ereignisse(out) if e["key"] not in gemeldet]
    tc = trend_check(out.get("trend") or {}, jetzt)
    if tc and tc["key"] not in gemeldet:
        msgs.append(tc)
    frisch = [a["id"] for a in ASSETS if a["id"] in out["assets"] and not out["assets"][a["id"]].get("veraltet")]
    if len(frisch) < len(ASSETS):
        fehlt = [a["name"] for a in ASSETS if a["id"] not in frisch]
        print("::warning::Keine aktuellen Kurse für:", ", ".join(fehlt))
        k = "stoerung:" + jetzt.strftime("%Y-%m-%d")          # höchstens eine Störungsmeldung pro Tag
        if k not in gemeldet:
            msgs.append({"title": "Turtle · Kursabruf gestört", "tags": ["turtle", "warning"], "key": k,
                         "message": "Keine aktuellen Kurse für: %s. Level und Order-Zettel fehlen dort. Details im Repo unter Actions → Turtle." % ", ".join(fehlt)})
    if os.environ.get("TURTLE_TEST", "").strip().lower() in ("1", "true"):
        msgs.append({"title": "Turtle · Testnachricht", "tags": ["turtle", "white_check_mark"], "key": "test:%d" % out["ts"],
                     "message": "GitHub erreicht dein Handy. Kurse geladen für: %s." % (
                         ", ".join("%s (%s)" % (out["assets"][k]["name"], out["assets"][k]["quelle"].split(" ·")[0]) for k in frisch) or "keinen Markt")})
    for m in msgs:
        print("Push:", m["title"]); print(m["message"])
        if ntfy(m) or not os.environ.get("NTFY_TOPIC"):
            gemeldet[m["key"]] = out["ts"]
    out["gemeldet"] = gemeldet
    json.dump(out, open(neu_pfad, "w"), ensure_ascii=False, separators=(",", ":"))
    print("turtle.json:", ", ".join("%s %s" % (k, "im Trade" if v.get("ana") and v["ana"]["pos"] else "flat") for k, v in out["assets"].items()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
