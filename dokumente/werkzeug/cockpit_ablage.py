#!/usr/bin/env python3
"""
cockpit_ablage.py - Bruecke zwischen dem Cockpit (Browser) und der Dokumenten-Ablage.

Wird ueber den Link-Typ cockpit-ablage:// aus dem Cockpit gestartet.
Einmalig einrichten mit Cockpit-Ablage-einrichten.bat (Doppelklick, im selben Ordner wie ablage.py).

Befehle:
  cockpit-ablage://test      Verbindung pruefen
  cockpit-ablage://analyse   PDFs in 00_Eingang analysieren -> Vorschlaege fuers Cockpit
  cockpit-ablage://ablegen   im Cockpit freigegebene Dokumente ablegen
  cockpit-ablage://index     vorhandenes Archiv ins Dokumentenverzeichnis aufnehmen
  cockpit-ablage://konsole   klassische Ablage (ablage.py) im Konsolenfenster

Regeln, Kategorien, Namenskonvention und Modell kommen unveraendert aus ablage.py,
d. h. Aenderungen dort gelten automatisch auch fuer das Cockpit.

Austausch mit dem Cockpit ueber den Ordner <Ablage>/_cockpit/:
  vorschlaege.json  Analyse-Ergebnisse je PDF im Eingang
  auftrag.json      vom Cockpit freigegebene Dokumente (wird nach dem Ablegen geloescht)
  index.json        Verzeichnis der abgelegten Dokumente (nur Metadaten, keine Inhalte)
  status.json       Stand des letzten Laufs
  protokoll.txt     Protokoll aller Ablagen

Direkt aufrufen zum Testen:  python cockpit_ablage.py test
"""

import base64
import hashlib
import json
import os
import re
import shutil
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER))


def warte(sekunden=None):
    if sekunden is None:
        try:
            input("\nEnter zum Schliessen...")
        except EOFError:
            pass
    else:
        print(f"\nDieses Fenster schliesst sich in {sekunden} Sekunden.")
        time.sleep(sekunden)


def lade_benutzer_umgebung():
    """Beim Start aus dem Browser erbt Python die Umgebung von Chrome - neu gesetzte
    Benutzer-Variablen (ABLAGE_ROOT, ANTHROPIC_API_KEY) fehlen dort bis zum Neustart.
    Deshalb unter Windows direkt aus der Registrierung nachladen."""
    if os.name != "nt":
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            for name in ("ABLAGE_ROOT", "ANTHROPIC_API_KEY"):
                if os.environ.get(name):
                    continue
                try:
                    wert, _ = winreg.QueryValueEx(k, name)
                    if wert:
                        os.environ[name] = os.path.expandvars(str(wert))
                except FileNotFoundError:
                    pass
    except OSError:
        pass


lade_benutzer_umgebung()

try:
    import ablage as A  # Regeln, Kategorien, Namenskonvention, Pfade
except ImportError as e:
    print("FEHLER: ablage.py wurde nicht gefunden.")
    print(f"cockpit_ablage.py muss im selben Ordner liegen wie ablage.py ({HIER}).")
    print(f"Details: {e}")
    warte()
    sys.exit(1)

ROOT = A.ROOT
KANAL = ROOT / "_cockpit"

# Zusatz zum System-Prompt aus ablage.py: Betrag und Bezugsjahr fuer die Verknuepfung im Cockpit
ZUSATZ = """

# Zusatzfelder fuer das Cockpit (zusaetzlich zum Ausgabeschema oben, im selben JSON)
- "betrag": Hauptbetrag des Dokuments in Euro als Zahl mit Punkt (z.B. 1234.56):
  Rechnungs-Endbetrag brutto; bei Jahres-/Verbrauchsabrechnungen die Gesamtkosten des Abrechnungszeitraums;
  bei Bescheinigungen und Bescheiden der bescheinigte bzw. festgesetzte Betrag. Kein Betrag erkennbar -> null
- "zahlbetrag": Betrag, der aufgrund des Dokuments tatsaechlich ueberwiesen oder abgebucht wird, als Zahl;
  Guthaben/Erstattung an den Empfaenger NEGATIV. Bei normalen Rechnungen gleich "betrag".
  Bei Abrechnungen mit Abschlaegen die Nachzahlung bzw. das Guthaben. Unklar -> null
- "jahr": Jahr, auf das sich das Dokument inhaltlich bezieht (Leistungs-/Abrechnungszeitraum, Steuerjahr,
  Bescheinigungsjahr) als Zahl. Unklar -> Jahr des Dokumentdatums

# Konfidenz
- "hoch": Alle Felder eindeutig erkannt, Kategorie klar
- "mittel": Kleinere Unsicherheiten (z.B. Datum nur geschaetzt)
- "niedrig": Grosse Unsicherheit, unleserlich, mehrdeutig oder unbekannter Dokumenttyp
"""


class Fehler(Exception):
    """Erwarteter Fehler mit verstaendlicher Meldung."""


# =============================================================================
# Dateien im Austauschordner
# =============================================================================

def jetzt() -> str:
    return datetime.now().isoformat(timespec="seconds")


def schreibe_json(pfad: Path, obj):
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_name(pfad.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, pfad)


def lies_json(pfad: Path, standard):
    try:
        return json.loads(pfad.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return standard
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"  Warnung: {pfad.name} ist beschaedigt und wird neu angelegt.")
        return standard


def status(id_, befehl, zustand, meldung="", ergebnis=None, start=None, fortschritt=None):
    try:
        schreibe_json(KANAL / "status.json", {
            "id": id_, "befehl": befehl, "status": zustand, "meldung": meldung,
            "start": start, "zeit": jetzt(), "fortschritt": fortschritt, "ergebnis": ergebnis,
        })
    except OSError as e:
        print(f"  Warnung: status.json konnte nicht geschrieben werden ({e})")


def protokoll(zeilen):
    try:
        KANAL.mkdir(parents=True, exist_ok=True)
        with open(KANAL / "protokoll.txt", "a", encoding="utf-8") as f:
            for z in zeilen:
                f.write(z + "\n")
    except OSError:
        pass


def konfig() -> dict:
    return {
        "empfaenger": A.EMPFAENGER,
        "archiv": {"Privat": A.ARCHIV_PRIVAT, "Geschaeftlich": A.ARCHIV_GESCHAEFTLICH},
        "stb": {"Privat": A.STB_PRIVAT, "Geschaeftlich": A.STB_GESCHAEFTLICH},
        "modell": A.MODEL,
    }


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


# =============================================================================
# Metadaten
# =============================================================================

def zahl(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).replace("€", "").replace("EUR", "").replace(" ", "").replace(" ", "").strip()
    if not s or A.is_empty(s):
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def iso_datum(v) -> str:
    d = A.format_date(v or "")
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else ""


def normalisiere(m) -> dict:
    m = dict(m or {})
    out = {}
    for k in ("empfaenger", "absender", "betreff", "archiv_bereich", "archiv_kategorie",
              "konfidenz", "hinweise", "steuer_begruendung"):
        v = m.get(k)
        out[k] = "" if A.is_empty(v) else str(v).strip()
    out["datum"] = iso_datum(m.get("datum"))
    out["empfaenger"] = out["empfaenger"].upper()
    out["absender"] = A.clean_text(out["absender"])
    out["betreff"] = A.clean_text(out["betreff"])
    out["steuerrelevant"] = bool(m.get("steuerrelevant")) and str(m.get("steuerrelevant")).lower() not in ("false", "0", "nein")
    sb = m.get("stb_belegart")
    out["stb_belegart"] = None if A.is_empty(sb) else str(sb).strip()
    out["betrag"] = zahl(m.get("betrag"))
    out["zahlbetrag"] = zahl(m.get("zahlbetrag"))
    try:
        j = int(str(m.get("jahr")).strip()[:4])
        out["jahr"] = j if 1990 <= j <= 2100 else None
    except (TypeError, ValueError):
        out["jahr"] = None
    if not out["jahr"] and out["datum"]:
        out["jahr"] = int(out["datum"][:4])
    out["konfidenz"] = out["konfidenz"].lower()
    return out


def gueltig(meta: dict):
    if meta.get("archiv_bereich") not in ("Privat", "Geschaeftlich"):
        return False, f"Ungueltiger Bereich: {meta.get('archiv_bereich')}"
    kats = A.ARCHIV_PRIVAT if meta["archiv_bereich"] == "Privat" else A.ARCHIV_GESCHAEFTLICH
    if meta.get("archiv_kategorie") not in kats:
        return False, f"Ungueltige Kategorie: {meta.get('archiv_kategorie')}"
    if meta.get("steuerrelevant"):
        arten = A.STB_PRIVAT if meta["archiv_bereich"] == "Privat" else A.STB_GESCHAEFTLICH
        if meta.get("stb_belegart") not in arten:
            return False, f"Ungueltige StB-Belegart: {meta.get('stb_belegart')}"
    return True, ""


def eintrag(meta: dict, ziel: Path, stb, quelle: str) -> dict:
    ra = rel(ziel)
    st = bool(meta.get("steuerrelevant"))
    return {
        "id": hashlib.sha1(ra.encode("utf-8")).hexdigest()[:12],
        "datei": ziel.name, "archiv": ra, "stb": stb,
        "datum": meta.get("datum") or "", "empfaenger": meta.get("empfaenger") or "",
        "st": st, "absender": meta.get("absender") or "", "betreff": meta.get("betreff") or "",
        "bereich": meta.get("archiv_bereich") or "", "kategorie": meta.get("archiv_kategorie") or "",
        "belegart": meta.get("stb_belegart") if st else None,
        "betrag": meta.get("betrag"), "zahlbetrag": meta.get("zahlbetrag"), "jahr": meta.get("jahr"),
        "abgelegt": jetzt(), "quelle": quelle,
    }


def lade_index() -> dict:
    d = lies_json(KANAL / "index.json", {})
    return {e["archiv"]: e for e in d.get("dokumente", []) if isinstance(e, dict) and e.get("archiv")}


def speichere_index(m: dict):
    liste = sorted(m.values(), key=lambda e: (e.get("datum") or "", e.get("archiv") or ""), reverse=True)
    schreibe_json(KANAL / "index.json", {"version": 1, "aktualisiert": jetzt(), "konfig": konfig(), "dokumente": liste})


def lade_vorschlaege() -> dict:
    v = lies_json(KANAL / "vorschlaege.json", {})
    if not isinstance(v.get("dateien"), dict):
        v["dateien"] = {}
    return v


def speichere_vorschlaege(dateien: dict):
    schreibe_json(KANAL / "vorschlaege.json", {"version": 1, "aktualisiert": jetzt(), "konfig": konfig(), "dateien": dateien})


# =============================================================================
# Befehle
# =============================================================================

def cmd_test(id_):
    key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    pdfs = len(list(A.EINGANG.glob("*.pdf"))) if A.EINGANG.exists() else None
    print(f"  Python:        {sys.version.split()[0]}")
    print(f"  Ablage:        {ROOT}")
    print(f"  Eingang:       {'vorhanden, ' + str(pdfs) + ' PDF(s)' if pdfs is not None else 'FEHLT'}")
    print(f"  API-Schluessel:{' gefunden' if key else ' FEHLT (Umgebungsvariable ANTHROPIC_API_KEY)'}")
    print(f"  Modell:        {A.MODEL}")
    return {"meldung": "Verbindung steht" + ("" if key else " - aber der API-Schluessel fehlt"),
            "python": sys.version.split()[0], "api_key": key, "root": str(ROOT), "eingang": pdfs,
            "modell": A.MODEL, "konfig": konfig()}


def analysiere(client, pdf: Path) -> dict:
    daten = base64.standard_b64encode(pdf.read_bytes()).decode("utf-8")
    antwort = client.messages.create(
        model=A.MODEL,
        max_tokens=1200,
        system=A.SYSTEM_PROMPT + ZUSATZ,
        messages=[{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": daten}},
            {"type": "text", "text": "Analysiere dieses Dokument und antworte mit reinem JSON ohne Codefences."},
        ]}],
    )
    return normalisiere(A.extract_json(antwort.content[0].text))


def cmd_analyse(id_):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise Fehler("Umgebungsvariable ANTHROPIC_API_KEY ist nicht gesetzt (siehe Einrichtung).")
    if not A.EINGANG.exists():
        raise Fehler(f"Eingangsordner existiert nicht: {A.EINGANG}")
    alt = lade_vorschlaege()["dateien"]
    pdfs = sorted(p for p in A.EINGANG.glob("*.pdf") if p.is_file())
    dateien, offen = {}, []
    for p in pdfs:
        s = p.stat()
        sig = {"groesse": s.st_size, "geaendert": int(s.st_mtime)}
        e = alt.get(p.name)
        if e and e.get("meta") and not e.get("fehler") and e.get("groesse") == sig["groesse"] and e.get("geaendert") == sig["geaendert"]:
            dateien[p.name] = e
        else:
            offen.append((p, sig))
    print(f"  {len(pdfs)} PDF(s) im Eingang, davon {len(offen)} neu zu analysieren.\n")
    speichere_vorschlaege(dateien)
    if not offen:
        return {"meldung": f"Nichts Neues - {len(pdfs)} PDF(s) waren schon analysiert.", "dateien": len(pdfs), "neu": 0, "fehler": 0}
    client = A.Anthropic()
    fehler = 0
    for i, (p, sig) in enumerate(offen, 1):
        print(f"  [{i:3}/{len(offen)}] {p.name[:52]:<52} ", end="", flush=True)
        try:
            meta = analysiere(client, p)
            ok, grund = gueltig(meta)
            dateien[p.name] = dict(sig, meta=meta, analysiert=jetzt(), fehler=None, pruefen=None if ok else grund)
            print("OK" if ok else "PRUEFEN")
        except Exception as e:  # noqa: BLE001 - weiter mit dem naechsten Dokument
            fehler += 1
            dateien[p.name] = dict(sig, meta=None, analysiert=jetzt(), fehler=f"{type(e).__name__}: {e}"[:300], pruefen=None)
            print("FEHLER")
        speichere_vorschlaege(dateien)
        status(id_, "analyse", "laeuft", f"{i} von {len(offen)} analysiert", fortschritt={"i": i, "n": len(offen)})
    return {"meldung": f"{len(offen) - fehler} Dokument(e) analysiert" + (f", {fehler} Fehler" if fehler else "") + ". Jetzt im Cockpit pruefen und freigeben.",
            "dateien": len(pdfs), "neu": len(offen), "fehler": fehler}


def lege_ab(meta: dict, src: Path) -> dict:
    name = A.build_filename(meta)
    adir = A.ARCHIV / meta["archiv_bereich"] / meta["archiv_kategorie"]
    adir.mkdir(parents=True, exist_ok=True)
    ziel = A.ensure_unique(adir / name)
    shutil.move(str(src), str(ziel))
    stb = None
    if meta.get("steuerrelevant"):
        # Steuerjahr: das inhaltliche Jahr (z. B. Lohnsteuerbescheinigung 2026 vom Februar 2027 -> 2026),
        # sonst wie in ablage.py das Jahr des Dokumentdatums
        jahr = str(meta.get("jahr") or A.get_stb_year(meta))
        sdir = A.STEUERBERATER / jahr / meta["archiv_bereich"] / meta["stb_belegart"]
        sdir.mkdir(parents=True, exist_ok=True)
        sziel = A.ensure_unique(sdir / ziel.name)
        shutil.copy2(str(ziel), str(sziel))
        stb = rel(sziel)
    return eintrag(meta, ziel, stb, "cockpit")


def cmd_ablegen(id_):
    auftrag = lies_json(KANAL / "auftrag.json", None)
    if not auftrag or not auftrag.get("dokumente"):
        raise Fehler("Kein Auftrag vom Cockpit gefunden (auftrag.json fehlt oder ist leer).")
    if id_ and auftrag.get("id") and auftrag["id"] != id_:
        raise Fehler("Der Auftrag passt nicht zu diesem Aufruf - bitte im Cockpit erneut auf Ablegen tippen.")
    idx = lade_index()
    v = lade_vorschlaege()["dateien"]
    erg, ok_n = [], 0
    log = [f"--- Ablage aus dem Cockpit {jetzt()} ---"]
    for d in auftrag["dokumente"]:
        name = Path(str(d.get("datei", ""))).name  # nur Dateinamen, keine Pfade
        src = A.EINGANG / name
        meta = normalisiere(d.get("meta"))
        print(f"  {name[:52]:<52} ", end="", flush=True)
        if not name or not src.is_file():
            erg.append({"datei": name, "ok": False, "meldung": "nicht mehr im Eingang"})
            print("FEHLT")
            continue
        ok, grund = gueltig(meta)
        if not ok:
            erg.append({"datei": name, "ok": False, "meldung": grund})
            print("UNGUELTIG")
            continue
        try:
            e = lege_ab(meta, src)
            idx[e["archiv"]] = e
            v.pop(name, None)
            ok_n += 1
            erg.append({"datei": name, "ok": True, "ziel": e["archiv"], "stb": e["stb"], "id": e["id"]})
            log.append(f"[OK] {name} -> {e['archiv']}" + (f" | StB: {e['stb']}" if e["stb"] else ""))
            print("OK")
        except Exception as ex:  # noqa: BLE001
            erg.append({"datei": name, "ok": False, "meldung": f"{type(ex).__name__}: {ex}"[:300]})
            log.append(f"[FEHLER] {name}: {ex}")
            print("FEHLER")
    speichere_index(idx)
    speichere_vorschlaege(v)
    try:
        (KANAL / "auftrag.json").unlink()
    except FileNotFoundError:
        pass
    protokoll(log)
    n_err = len(erg) - ok_n
    return {"meldung": f"{ok_n} Dokument(e) abgelegt" + (f", {n_err} nicht abgelegt" if n_err else "") + ".",
            "abgelegt": ok_n, "fehler": n_err, "dokumente": erg}


def zerlege_namen(name: str):
    """Datum, Empfaenger, ST und Rest aus einem Dateinamen nach der Namenskonvention."""
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    teile = [t for t in stem.split("_") if t != ""]
    datum, empf, st = "", "", False
    if teile and re.fullmatch(r"\d{8}", teile[0]):
        t = teile.pop(0)
        datum = f"{t[:4]}-{t[4:6]}-{t[6:8]}"
    if teile and all(k in A.EMPFAENGER for k in teile[0].split("-")):
        empf = teile.pop(0)
    if teile and teile[0] == "ST":
        st = True
        teile.pop(0)
    return datum, empf, st, " ".join(teile)


def cmd_index(id_):
    if not A.ARCHIV.exists():
        raise Fehler(f"Archivordner existiert nicht: {A.ARCHIV}")
    idx = lade_index()
    # Steuerberater-Kopien nach Dateiname: 01_Steuerberater/<Jahr>/<Bereich>/<Belegart>/<Datei>
    stb = {}
    if A.STEUERBERATER.exists():
        for p in A.STEUERBERATER.rglob("*.pdf"):
            teile = p.relative_to(A.STEUERBERATER).parts
            if len(teile) >= 4:
                stb.setdefault(p.name, (teile[0], teile[1], teile[2], rel(p)))
    gefunden, neu = set(), 0
    for p in A.ARCHIV.rglob("*.pdf"):
        teile = p.relative_to(A.ARCHIV).parts
        ra = rel(p)
        gefunden.add(ra)
        s = stb.get(p.name)
        if ra in idx:
            if s and not idx[ra].get("stb"):
                idx[ra]["stb"] = s[3]
            continue
        datum, empf, st, rest = zerlege_namen(p.name)
        meta = {
            "datum": datum, "empfaenger": empf, "steuerrelevant": st or bool(s),
            "absender": "", "betreff": rest,
            "archiv_bereich": teile[0] if len(teile) > 1 else "", "archiv_kategorie": teile[1] if len(teile) > 2 else "",
            "stb_belegart": s[2] if s else None, "betrag": None, "zahlbetrag": None,
            "jahr": int(s[0]) if s and s[0].isdigit() else (int(datum[:4]) if datum else None),
        }
        idx[ra] = eintrag(meta, p, s[3] if s else None, "bestand")
        neu += 1
    weg = [k for k in idx if k not in gefunden]
    for k in weg:
        del idx[k]
    speichere_index(idx)
    print(f"  {len(gefunden)} Dokument(e) im Archiv, {neu} neu aufgenommen, {len(weg)} nicht mehr vorhanden.")
    return {"meldung": f"Verzeichnis aktualisiert: {len(gefunden)} Dokumente ({neu} neu, {len(weg)} entfernt).",
            "gesamt": len(gefunden), "neu": neu, "entfernt": len(weg)}


def cmd_konsole(id_):
    A.main()  # klassische Ablage mit Rueckfragen im Konsolenfenster
    print("\nVerzeichnis fuer das Cockpit wird aktualisiert ...")
    erg = cmd_index(id_)
    erg["ohne_warten"] = True
    return erg


BEFEHLE = {"test": cmd_test, "analyse": cmd_analyse, "ablegen": cmd_ablegen, "index": cmd_index, "konsole": cmd_konsole}


def lies_aufruf(argv):
    if len(argv) < 2:
        return "", {}
    arg = argv[1].strip().strip('"')
    if "://" in arg:
        u = urlparse(arg)
        cmd = (u.netloc or u.path).strip("/").lower()
        q = {k: v[0] for k, v in parse_qs(u.query).items() if v}
        return cmd, q
    return arg.lower(), {}


def main():
    cmd, q = lies_aufruf(sys.argv)
    id_ = q.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{0,40}", id_):
        id_ = ""
    if os.name == "nt":
        os.system(f"title Cockpit-Ablage - {cmd or 'Hilfe'}")
    print()
    print("=" * 72)
    print(f" Cockpit-Ablage: {cmd or '-'}")
    print(f" Ablage: {ROOT}")
    print("=" * 72)
    if cmd not in BEFEHLE:
        print(__doc__)
        warte()
        return
    if not ROOT.exists():
        print(f"\nFEHLER: Ablage-Ordner nicht gefunden: {ROOT}")
        print("Bitte Cockpit-Ablage-einrichten.bat erneut ausfuehren und den richtigen Ordner angeben.")
        warte()
        return
    start = jetzt()
    try:
        KANAL.mkdir(parents=True, exist_ok=True)
        status(id_, cmd, "laeuft", "gestartet", start=start)
        erg = BEFEHLE[cmd](id_) or {}
        status(id_, cmd, "fertig", erg.get("meldung", ""), ergebnis=erg, start=start)
        print("\n" + erg.get("meldung", "Fertig."))
        if not erg.get("ohne_warten"):
            warte(4)
    except Fehler as e:
        status(id_, cmd, "fehler", str(e), start=start)
        print(f"\nFEHLER: {e}")
        warte()
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        status(id_, cmd, "fehler", f"{type(e).__name__}: {e}", start=start)
        warte()


if __name__ == "__main__":
    main()
