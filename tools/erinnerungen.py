#!/usr/bin/env python3
"""
erinnerungen.py - Wochenvorschau und Monatsbericht aus den Cockpit-Daten.

Liest die JSON-Dateien des privaten Daten-Repos (vertraege, haus, ferienwohnung, dokumente,
finanzen, einkaeufe) und gibt einen kurzen deutschen Text aus, z. B. fuer eine Push-Nachricht.
Rechnet wie das Cockpit (vertraege/logic.js, finanzen/logic.js). Enthaelt selbst keine persoenlichen Daten.

Aufruf:
  python3 erinnerungen.py woche <ordner-mit-json> [--heute JJJJ-MM-TT]
  python3 erinnerungen.py monat <ordner-mit-json> [--heute JJJJ-MM-TT]   (Bericht fuer den Vormonat)
"""

import calendar
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

HIER = Path(__file__).resolve().parent
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def lade(ordner, name):
    try:
        return json.loads((Path(ordner) / f"{name}.json").read_text("utf-8")).get("data")
    except (OSError, ValueError):
        return None


# ----------------------------------------------------------------------------- Datum
def dt(s):
    return date.fromisoformat(str(s)[:10])


def letzter(y, m):
    return calendar.monthrange(y, m)[1]


def plus_m(s, n):
    """Monate addieren; ein Monatsletzter bleibt Monatsletzter (wie im Cockpit)."""
    d = dt(s)
    ende = d.day == letzter(d.year, d.month)
    m0 = d.month - 1 + n
    y, m = d.year + m0 // 12, m0 % 12 + 1
    lz = letzter(y, m)
    return date(y, m, lz if ende else min(d.day, lz)).isoformat()


def plus_t(s, n):
    return (dt(s) + timedelta(days=n)).isoformat()


def minus_frist(s, f, e):
    f = int(f or 0)
    if not f:
        return s
    return plus_t(s, -f) if e == "T" else plus_t(s, -7 * f) if e == "W" else plus_m(s, -f)


def plus_frist(s, f, e):
    f = int(f or 0)
    if not f:
        return s
    return plus_t(s, f) if e == "T" else plus_t(s, 7 * f) if e == "W" else plus_m(s, f)


def tage(a, b):
    return (dt(b) - dt(a)).days


def de(s):
    return f"{s[8:10]}.{s[5:7]}.{s[:4]}"


def de_kurz(s):
    d = dt(s)
    return f"{WT[d.weekday()]} {d.day:02d}.{d.month:02d}."


def wann(n):
    if n < 0:
        return "seit gestern" if n == -1 else f"seit {-n} Tagen"
    return "heute" if n == 0 else "morgen" if n == 1 else f"in {n} Tagen"


def eur(v, nk=0):
    s = f"{abs(v):,.{nk}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("−" if v < 0 else "") + s + " €"


# ----------------------------------------------------------------------------- Verträge & Fristen
RHYTHMUS = {1: "monatlich", 2: "alle 2 Monate", 3: "vierteljährlich", 6: "halbjährlich", 12: "jährlich", 24: "alle 2 Jahre"}


def aktiv(o):
    return [x for x in (o or {}).values() if isinstance(x, dict) and not x.get("del")]


def termin(v, t):
    if v.get("vorlage") == "nk":
        return None  # nicht kuendbar (Steuer, Gebuehr) - keine Erinnerung
    if v.get("status") in ("gekuendigt", "beendet") or v.get("jederzeit") or not v.get("bis"):
        return None
    E, verl, f, e, i = v["bis"], int(v.get("verl") or 0), v.get("frist"), v.get("einh") or "M", 0
    while minus_frist(E, f, e) < t and i < 600:
        if verl > 0:
            E = plus_m(E, verl)
            i += 1
        else:
            return None  # jederzeit kuendbar - keine Frist
    kb = minus_frist(E, f, e)
    if i > 0 and verl <= 1:
        return None  # Mindestlaufzeit vorbei, verlaengert sich monatlich - praktisch jederzeit kuendbar
    return {"ende": E, "bis": kb, "tage": tage(t, kb)}


def naechste(f):
    if not f.get("datum"):
        return None
    D, w, i = f["datum"], int(f.get("wdh") or 0), 0
    mo = f.get("monate") if isinstance(f.get("monate"), list) and f.get("monate") else None  # z. B. nur Heizperiode
    if not w:
        return None if f.get("erledigt") else D
    while i < 2000 and ((f.get("erledigt") and D <= f["erledigt"]) or (mo and int(D[5:7]) not in mo)):
        D = plus_m(D, w)
        i += 1
    return D


def auto_fristen(haus, t):
    out, jetzt = [], int(t[:4])
    for b in (haus or {}).get("belegung") or []:
        if not isinstance(b, dict) or b.get("art") != "miete" or b.get("del"):
            continue
        for y in (jetzt - 1, jetzt):
            von, bis = b.get("von") or "0000", b.get("bis") or "9999"
            if von > f"{y}-12-31" or bis < f"{y}-01-01" or (y == jetzt and bis >= t):
                continue
            out.append({"id": f"nka:{y}:{b.get('id')}", "titel": f"Nebenkostenabrechnung {y} an {b.get('name') or 'Mieter'}",
                        "datum": f"{y + 1}-12-31", "vorlauf": 60})
    return out


def termine(vt, haus, t):
    vt = vt or {}
    out = []
    for v in aktiv(vt.get("vertraege")):
        r = termin(v, t)
        if not r:
            continue
        ok = bool(v.get("behalten")) and v["behalten"] >= r["bis"]
        out.append({"typ": "kuendigung", "titel": f"Kündigen bis: {v.get('name') or 'Vertrag'}", "datum": r["bis"], "tage": r["tage"],
                    "info": f"zum {de(r['ende'])}", "faellig": v.get("erinnern") is not False and not ok and r["tage"] <= int(v.get("vorlauf") or 30),
                    "erledigt": ok})
    for f in aktiv(vt.get("fristen")):
        D = naechste(f)
        if not D:
            continue
        n = tage(t, D)
        vorlauf = 14 if f.get("vorlauf") is None else int(f["vorlauf"])
        out.append({"typ": "frist", "titel": f.get("titel") or "Frist", "datum": D, "tage": n, "faellig": n <= vorlauf,
                    "info": RHYTHMUS.get(int(f.get("wdh") or 0), "")})
    erl = vt.get("auto") or {}
    for a in auto_fristen(haus, t):
        if (erl.get(a["id"]) or {}).get("erledigt"):
            continue
        n = tage(t, a["datum"])
        out.append({"typ": "auto", "titel": a["titel"], "datum": a["datum"], "tage": n, "faellig": n <= a["vorlauf"], "info": ""})
    return sorted(out, key=lambda e: e["datum"])


# ----------------------------------------------------------------------------- Finanzen-Kategorien (wie finanzen/logic.js)
UNKAT = "Unkategorisiert"
GENERIC = re.compile(r"^(lastschrift|überweisung|ueberweisung|gutschrift|dauerauftrag|dauerauftrag/terminueberweisung|kartenzahlung|abbuchung|einzahlung|auszahlung|entgelt|zinsen|debit transfer|credit transfer|presentment|direct debit|mastercard payment|income|outgoing transfer|incoming transfer|gutschrift/dauerauftrag)$")
_re_cache = {}


def standard_regeln():
    """DEFAULT_RULES aus finanzen/logic.js lesen (falls in den Daten keine eigenen Regeln stehen)."""
    try:
        js = (HIER.parent / "finanzen" / "logic.js").read_text("utf-8")
        block = re.search(r"var DEFAULT_RULES=(\[.*?\n\]);", js, re.S).group(1)
        block = re.sub(r"([{,])\s*(name|words|onlyIn|onlyOut|neutral)\s*:", r'\1"\2":', block)
        return json.loads(block)
    except (OSError, AttributeError, ValueError):
        return []


def kw_re(k):
    k = str(k or "").strip().lower()
    if not k:
        return None
    if k in _re_cache:
        return _re_cache[k]
    pre, suf, core = k.startswith("*"), k.endswith("*"), k.strip("*")
    if not core:
        return None
    r = re.compile(("" if pre else r"(?<![^\W_])") + re.escape(core) + ("" if suf else r"(?![^\W_])"))
    _re_cache[k] = r
    return r


def partner_key(p):
    return re.sub(r"\s+", " ", str(p or "").lower()).strip()


def kompakt(s):
    return re.sub(r"\s+", "", str(s or "").lower())


def kategorie(t, regeln, pmap, tmap, zmap=None):
    if t.get("cat"):
        return t["cat"]
    if zmap and t.get("z"):  # Regeln aus dem Verwendungszweck (laengstes Stichwort zuerst)
        z = kompakt(t["z"])
        for k, x in sorted(((k, x) for k, x in zmap.items() if isinstance(x, dict) and not x.get("del") and x.get("c") and kompakt(k)),
                           key=lambda kv: -len(kompakt(kv[0]))):
            if kompakt(k) in z:
                return x["c"]
    if t.get("p") and pmap.get(partner_key(t["p"])):
        return pmap[partner_key(t["p"])]
    if not t.get("p") and t.get("t") and tmap.get(partner_key(t["t"])):
        return tmap[partner_key(t["t"])]
    h = f"{t.get('p', '')} {t.get('z', '')} {t.get('t', '')}".lower()
    for r in regeln:
        if r.get("onlyIn") and t["b"] < 0:
            continue
        if r.get("onlyOut") and t["b"] > 0:
            continue
        for w in r.get("words") or []:
            rx = kw_re(w)
            if rx and rx.search(h):
                return r["name"]
    return UNKAT


# ----------------------------------------------------------------------------- Ferienwohnung
def buchungen(fw):
    return [b for b in ((fw or {}).get("bookings") or {}).values()
            if isinstance(b, dict) and b.get("arr") and b.get("dep") and not b.get("cancelled") and not b.get("blocked")]


def gaeste(b):
    return int(b.get("adults") or 0) + int(b.get("children") or 0)


# ----------------------------------------------------------------------------- Wochenvorschau
def woche(ordner, t):
    vt, haus, fw, dok, fin = (lade(ordner, n) for n in ("vertraege", "haus", "ferienwohnung", "dokumente", "finanzen"))
    ende = plus_t(t, 6)
    kw = dt(t).isocalendar()[1]
    zeilen = [f"📅 Wochenvorschau KW {kw} ({de_kurz(t)} – {de_kurz(ende)})"]

    alle = [e for e in termine(vt, haus, t) if not e.get("erledigt")]
    jetzt = [e for e in alle if e["faellig"] or e["tage"] <= 7]
    if jetzt:
        zeilen.append("")
        zeilen.append("⏰ Fristen")
        for e in jetzt:
            ic = "✂️" if e["typ"] == "kuendigung" else "🏘️" if e["typ"] == "auto" else "📌"
            zeilen.append(f"{ic} {e['titel']} – {de_kurz(e['datum'])} ({wann(e['tage'])})" + (f", {e['info']}" if e["typ"] == "kuendigung" else ""))

    an = sorted((b for b in buchungen(fw) if t <= b["arr"] <= ende), key=lambda b: b["arr"])
    ab = sorted((b for b in buchungen(fw) if t <= b["dep"] <= ende), key=lambda b: b["dep"])
    if an or ab:
        zeilen.append("")
        zeilen.append("🏡 Ferienwohnung")
        for b in an:
            g = gaeste(b)
            zeilen.append(f"🧳 Anreise {de_kurz(b['arr'])}: " + (f"{g} Gäste, " if g else "") + f"{tage(b['arr'], b['dep'])} Nächte")
        for b in ab:
            zeilen.append(f"🧹 Abreise {de_kurz(b['dep'])} – Reinigung")

    sonst = []
    if dok:
        if dok.get("eingang"):
            n = dok["eingang"]
            sonst.append(f"📥 {n} {'Dokument' if n == 1 else 'Dokumente'} im Eingang (am PC analysieren)")
        if dok.get("kontoCsv"):
            n = dok["kontoCsv"]
            sonst.append(f"🏦 {n} {'Kontoauszug' if n == 1 else 'Kontoauszüge'} im Eingang (Finanzen am PC öffnen)")
    if fin and fin.get("tx"):
        neu = max(x["d"] for x in fin["tx"])
        if tage(neu, t) > 14:
            sonst.append(f"🏦 Kontoauszüge holen – neueste Buchung vom {de(neu)}")
        regeln = fin.get("rules") or standard_regeln()
        von = plus_t(t, -90)
        unk = sum(1 for x in fin["tx"] if x["d"] >= von and kategorie(x, regeln, fin.get("pmap") or {}, fin.get("tmap") or {}, fin.get("zmap")) == UNKAT)
        if unk:
            sonst.append(f"🏷️ {unk} Buchungen ohne Kategorie (letzte 90 Tage)")
    if sonst:
        zeilen.append("")
        zeilen.extend(sonst)

    if len(zeilen) == 1:
        zeilen.append("")
        zeilen.append("✓ Diese Woche steht nichts an.")
    spaeter = [e for e in alle if not e["faellig"] and 7 < e["tage"] <= 45]
    if spaeter:
        zeilen.append("")
        zeilen.append("Danach: " + "; ".join(f"{e['titel']} {de(e['datum'])[:6]}" for e in spaeter[:4]))
    return "\n".join(zeilen)


# ----------------------------------------------------------------------------- Monatsbericht (Vormonat)
def monat(ordner, t):
    vt, haus, fw, fin, ek = (lade(ordner, n) for n in ("vertraege", "haus", "ferienwohnung", "finanzen", "einkaeufe"))
    d = dt(t).replace(day=1) - timedelta(days=1)
    y, m = d.year, d.month
    pfx = f"{y}-{m:02d}"
    zeilen = [f"📊 Monatsbericht {MONATE[m - 1]} {y}"]

    if fin and fin.get("tx"):
        regeln = fin.get("rules") or standard_regeln()
        neutral = {r["name"] for r in regeln if r.get("neutral")}
        pmap, tmap, konten = fin.get("pmap") or {}, fin.get("tmap") or {}, fin.get("konten") or {}
        ber = {}
        kat = {}
        for x in fin["tx"]:
            if not x["d"].startswith(pfx):
                continue
            c = kategorie(x, regeln, pmap, tmap, fin.get("zmap"))
            if c in neutral:
                continue
            b = (konten.get(x.get("k")) or {}).get("bereich") or "privat"
            e = ber.setdefault(b, [0.0, 0.0])
            if x["b"] > 0:
                e[0] += x["b"]
            else:
                e[1] += x["b"]
                if b == "privat":
                    kat[c] = kat.get(c, 0) + x["b"]
        zeilen.append("")
        for b, name in (("privat", "Privat"), ("geschaeft", "Geschäft")):
            if b in ber:
                ein, aus = ber[b]
                zeilen.append(f"💶 {name}: Einnahmen {eur(ein)} · Ausgaben {eur(-aus)} · Saldo {'+' if ein + aus >= 0 else ''}{eur(ein + aus)}")
        top = sorted(kat.items(), key=lambda kv: kv[1])[:5]
        if top:
            zeilen.append("Größte Ausgaben: " + ", ".join(f"{k} {eur(-v)}" for k, v in top))
        unk = sum(1 for x in fin["tx"] if x["d"].startswith(pfx) and kategorie(x, regeln, pmap, tmap, fin.get("zmap")) == UNKAT)
        if unk:
            zeilen.append(f"🏷️ {unk} Buchungen ohne Kategorie")
        neu = max(x["d"] for x in fin["tx"])
        if neu < f"{pfx}-{letzter(y, m):02d}":
            zeilen.append(f"⚠ Buchungen nur bis {de(neu)} importiert – der Monat ist noch nicht vollständig.")

    if ek and ek.get("bons"):
        korr = ek.get("korr") or {}
        bons = [b for b in ek["bons"] if str(b.get("datum", "")).startswith(pfx) and not (korr.get(b.get("id")) or {}).get("aus")]
        if bons:
            summe = sum(b["summe"] for b in bons)
            karte = sum(b["summe"] for b in bons if ((korr.get(b["id"]) or {}).get("zahlart") or b.get("zahlart")) == "karte")
            bar = sum(b["summe"] for b in bons if ((korr.get(b["id"]) or {}).get("zahlart") or b.get("zahlart")) == "bar")
            zeilen.append(f"🧾 Einkäufe: {len(bons)} Bons, {eur(summe)} (Karte {round(100 * karte / summe) if summe else 0} %, bar {round(100 * bar / summe) if summe else 0} %)")

    if fw:
        tage_m = letzter(y, m)
        apts = max(1, len((fw.get("apartments") or {})))
        naechte, umsatz, n = 0, 0.0, 0
        for b in buchungen(fw):
            nn = tage(b["arr"], b["dep"])
            if nn <= 0:
                continue
            pro = float(b.get("price") or 0) / nn
            drin = sum(1 for i in range(nn) if plus_t(b["arr"], i).startswith(pfx))
            if drin:
                naechte += drin
                umsatz += pro * drin
                n += 1
        if naechte:
            zeilen.append(f"🏡 Ferienwohnung: {naechte} Nächte belegt ({round(100 * naechte / (tage_m * apts))} %), Umsatz {eur(umsatz)}, {n} Buchungen")

    nm_von = f"{t[:7]}-01"
    nm_bis = f"{t[:7]}-{letzter(int(t[:4]), int(t[5:7])):02d}"
    kommend = [e for e in termine(vt, haus, t) if not e.get("erledigt") and (e["faellig"] or nm_von <= e["datum"] <= nm_bis)]
    if kommend:
        zeilen.append("")
        zeilen.append(f"📅 Im {MONATE[int(t[5:7]) - 1]} fällig:")
        for e in kommend[:8]:
            zeilen.append(f"• {e['titel']} – {de(e['datum'])}")
    return "\n".join(zeilen)


def main(argv):
    if len(argv) < 3 or argv[1] not in ("woche", "monat"):
        print(__doc__)
        return 2
    t = date.today().isoformat()
    if "--heute" in argv:
        t = argv[argv.index("--heute") + 1]
    print(woche(argv[2], t) if argv[1] == "woche" else monat(argv[2], t))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
