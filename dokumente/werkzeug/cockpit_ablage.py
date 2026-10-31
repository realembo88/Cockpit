#!/usr/bin/env python3
"""
cockpit_ablage.py - Bruecke zwischen dem Cockpit (Browser) und der Dokumenten-Ablage.

Wird ueber den Link-Typ cockpit-ablage:// aus dem Cockpit gestartet.
Einmalig einrichten mit Cockpit-Ablage-einrichten.bat (Doppelklick, im selben Ordner wie ablage.py).

Befehle:
  cockpit-ablage://test      Verbindung pruefen
  cockpit-ablage://analyse   PDFs in 00_Eingang analysieren -> Vorschlaege fuers Cockpit
                             (sicher erkannte Kassenbons werden dabei gleich abgelegt)
  cockpit-ablage://ablegen   im Cockpit freigegebene Dokumente ablegen
  cockpit-ablage://index     vorhandenes Archiv ins Dokumentenverzeichnis aufnehmen
  cockpit-ablage://nachlesen Altbestand (nur ueber den Dateinamen erfasst) einmal inhaltlich auslesen:
                             Betrag, Datum, Vertrags-/Kundennummern, Kfz-Angaben - die Dateien bleiben, wo sie sind
  cockpit-ablage://konsole   klassische Ablage (ablage.py) im Konsolenfenster
  hausmeister                automatischer Lauf ohne Fenster (Windows-Aufgabenplanung: 10 Min. nach
                             der Anmeldung, dann stuendlich): Zaehlerfotos lesen, Eingang analysieren,
                             Briefe bekannter Absender ablegen, Sicherung - siehe Cockpit-Hausmeister-einrichten.bat

Regeln, Kategorien, Namenskonvention und Modell kommen unveraendert aus ablage.py,
d. h. Aenderungen dort gelten automatisch auch fuer das Cockpit.

Austausch mit dem Cockpit ueber den Ordner <Ablage>/_cockpit/:
  vorschlaege.json  Analyse-Ergebnisse je PDF im Eingang
  auftrag.json      vom Cockpit freigegebene Dokumente (wird nach dem Ablegen geloescht)
  index.json        Verzeichnis der abgelegten Dokumente (nur Metadaten, keine Inhalte)
  einkaeufe.json    Kassenbons mit Laden, Summe, Zahlart und Artikeln (Einkaufs-Statistik)
  laeden.json       eigene Ladennamen aus dem Cockpit (gelesener Name -> Name)
  status.json       Stand des letzten Laufs
  protokoll.txt     Protokoll aller Ablagen
  hausmeister.json  Stand des automatischen Laufs (Ablagen, Zaehlerfotos, Sicherung) fuers Cockpit
  hausmeister_einst.json  Einstellungen dafuer (sicherung_ziel, sicherung_tage, sicherung_behalten, auto_ablegen)
  zaehlerstaende.json     aus Fotos gelesene Zaehlerstaende - das Cockpit (Energie) uebernimmt sie
  lauf.lock / vorrang     Sperre gegen gleichzeitige Laeufe; ein Lauf aus dem Cockpit hat Vorrang

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
sys.dont_write_bytecode = True  # keinen __pycache__-Ordner neben den Skripten anlegen


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
- "kassenbon": NUR wenn das Dokument ein Kassenbon / Kassenzettel / Bewirtungs- oder Tankquittung eines
  Geschaefts ist (Supermarkt, Discounter, Drogerie, Baeckerei, Metzgerei, Baumarkt, Tankstelle, Apotheke,
  Restaurant ...). Bei allen anderen Dokumenten (Rechnungen per Post/E-Mail, Vertraege, Bescheide ...) null.
  Objekt mit:
  "laden": kurzer Name des Geschaefts bzw. der Kette ohne Rechtsform und Filialzusatz, z.B. "REWE", "EDEKA",
           "Aldi Sued", "Lidl", "dm", "Rossmann", "Baeckerei Mueller"
  "ort": Ort der Filiale oder null
  "datum": Kaufdatum "YYYY-MM-DD"; "zeit": Uhrzeit "HH:MM" oder null
  "summe": zu zahlender Gesamtbetrag in Euro als Zahl (Zeile SUMME / Zu zahlen / Gesamt, nach Rabatten, inkl. Pfand).
           NICHT der gegebene Betrag (Zeile "Gegeben", "Bar", "BAR EUR") und nicht das Rueckgeld!
  "gegeben": bei Barzahlung der gegebene Betrag laut Bon als Zahl, sonst null
  "rueckgeld": bei Barzahlung das Rueckgeld laut Bon als Zahl, sonst null
  "zahlart": "bar" (Bar, Gegeben, Rueckgeld), "karte" (girocard, EC-Cash, Maestro, V PAY, Visa, Mastercard,
             Kreditkarte, Kartenzahlung, kontaktlos, Apple Pay, Google Pay), "sonstiges" (Gutschein, App,
             PayPal, Rechnung) oder "unbekannt"
  "karte": Kartenart, falls erkennbar ("girocard", "Visa", "Mastercard", "Apple Pay" ...), sonst null
  "artikel": ALLE Positionen in der Reihenfolge des Bons als Liste von Objekten
     {"name": Artikelbezeichnung gut lesbar (Abkuerzungen des Bons ausschreiben, wenn eindeutig),
      "menge": Stueckzahl bzw. Gewicht in kg als Zahl (Standard 1),
      "preis": Zeilenbetrag in Euro als Zahl (Menge x Einzelpreis; Rabatte, Coupons und Pfandrueckgabe negativ),
      "kategorie": GENAU eine aus: {KATEGORIEN}}
     Pfand und Leergut -> "Pfand & Rabatte"; Rabatte/Coupons, die sich auf einen Artikel beziehen, ebenfalls.
     Die Zeilenbetraege sollen zusammen die Summe ergeben. Keine Zwischensummen, MwSt-Zeilen oder Zahlungszeilen.
- Fuer Kassenbons gilt ausserdem: "absender" = laden, "betreff" = "Einkauf" (Tankstelle: "Tanken",
  Restaurant: "Bewirtung"), "datum" = Kaufdatum, "betrag" und "zahlbetrag" = summe.
  Alltagseinkaeufe (Lebensmittel, Drogerie, Haushalt, Tanken, Gastronomie) -> archiv_bereich "Privat",
  archiv_kategorie "Einkaeufe", nicht steuerrelevant. Kaufbelege fuer langlebige Anschaffungen mit Garantie
  (Elektronik, Moebel, Geraete) weiter nach den Regeln oben (z.B. Quittungen_Garantien) - "kassenbon" trotzdem ausfuellen.

{ZUORDNUNG}
# Konfidenz
- "hoch": Alle Felder eindeutig erkannt, Kategorie klar
- "mittel": Kleinere Unsicherheiten (z.B. Datum nur geschaetzt)
- "niedrig": Grosse Unsicherheit, unleserlich, mehrdeutig oder unbekannter Dokumenttyp
"""

# Warengruppen fuer Kassenbons. Die Reihenfolge ist fest (im Cockpit wird die Nummer gespeichert):
# neue Gruppen nur hinten anfuegen, nie umsortieren.
KAT_EINKAUF = [
    "Obst & Gemüse", "Brot & Backwaren", "Milchprodukte & Eier", "Fleisch, Wurst & Fisch",
    "Vorrat & Konserven", "Tiefkühl & Fertiggerichte", "Süßes & Snacks", "Getränke (alkoholfrei)",
    "Alkohol", "Kaffee & Tee", "Drogerie & Hygiene", "Haushalt & Reinigung", "Baby & Kind", "Tier",
    "Non-Food & Sonstiges", "Pfand & Rabatte", "Kraftstoff", "Gastronomie",
]
KAT_SONST = KAT_EINKAUF.index("Non-Food & Sonstiges")
EINKAUF_KAT = "Einkaeufe"   # zusaetzliche Archiv-Kategorie (Privat) fuer Alltags-Kassenbons
# Angaben fuer die Zuordnung im Cockpit (Buchungen, Vertraege, Fahrzeuge) - auch beim Nachlesen des Altbestands
ZUORDNUNG = """- "dokumentart": kurze Art des Dokuments, z.B. "Rechnung", "Beitragsrechnung", "Bescheinigung", "Bescheid",
  "Vertrag", "Mitteilung", "Mahnung", "Angebot", "Kontoauszug", "HU-Bericht" oder null
- "faellig": Faelligkeits- bzw. Abbuchungsdatum "YYYY-MM-DD", falls im Dokument genannt, sonst null
- "referenzen": bis zu 5 Nummern, ueber die sich das Dokument einem Vertrag zuordnen laesst, als Liste von
  {"art": "vertrag"|"versicherungsschein"|"kunde"|"rechnung"|"mitglied"|"zaehler"|"sonst", "wert": "..."}.
  NIEMALS Steuer-ID, Steuernummer, IBAN, Konto-, Karten- oder Sozialversicherungsnummern aufnehmen. Keine -> []
- "kfz": nur bei Fahrzeugbezug (Zulassung, HU-/TUEV-Bericht, Werkstatt- oder Reifenrechnung, Kfz-Steuer,
  Kfz-Versicherung) ein Objekt {"kennzeichen": z.B. "AB-CD 123" oder null, "km": Kilometerstand als Zahl oder null,
  "hu_datum": Datum der Hauptuntersuchung "YYYY-MM-DD" (nur bei HU-/TUEV-Bericht) oder null,
  "hu_naechste": naechste HU "YYYY-MM" oder null}; ohne Fahrzeugbezug null
"""
ZUSATZ = ZUSATZ.replace("{KATEGORIEN}", ", ".join(f'"{k}"' for k in KAT_EINKAUF)).replace("{ZUORDNUNG}", ZUORDNUNG)
# Altbestand nachlesen: nur Angaben auslesen, nichts neu einordnen oder umbenennen
NACHLESEN_SYSTEM = """Du liest Angaben aus einem bereits abgelegten deutschen Dokument (Privat- oder Geschaeftspost).
Antworte mit reinem JSON ohne Codefences und ohne Erklaerungen mit genau diesen Feldern:
- "datum": Dokumentdatum "YYYY-MM-DD" oder null
- "absender": kurzer Name des Absenders (Firma, Behoerde, Person) oder null
- "betrag": Hauptbetrag in Euro als Zahl mit Punkt: Rechnungs-Endbetrag brutto; bei Jahres-/Verbrauchsabrechnungen die
  Gesamtkosten; bei Bescheinigungen und Bescheiden der bescheinigte bzw. festgesetzte Betrag; kein Betrag -> null
- "zahlbetrag": tatsaechlich ueberwiesener oder abgebuchter Betrag als Zahl, Guthaben/Erstattung NEGATIV;
  bei normalen Rechnungen gleich "betrag"; bei Abrechnungen mit Abschlaegen die Nachzahlung bzw. das Guthaben; unklar -> null
- "jahr": Jahr, auf das sich das Dokument inhaltlich bezieht, als Zahl; unklar -> Jahr des Dokumentdatums
""" + ZUORDNUNG


class Fehler(Exception):
    """Erwarteter Fehler mit verstaendlicher Meldung."""


# =============================================================================
# Dateien im Austauschordner
# =============================================================================

def jetzt() -> str:
    return datetime.now().isoformat(timespec="seconds")


def schreibe_json(pfad: Path, obj, kompakt=False):
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_name(pfad.name + ".tmp")
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if kompakt else json.dumps(obj, ensure_ascii=False, indent=1)
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, pfad)


def lies_json(pfad: Path, standard):
    try:
        return json.loads(pfad.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return standard
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"  Warnung: {pfad.name} ist beschaedigt und wird neu angelegt.")
        return standard


STILL = False  # Hausmeister: kein status.json (gehoert dem Lauf aus dem Cockpit), keine Ausgaben


def status(id_, befehl, zustand, meldung="", ergebnis=None, start=None, fortschritt=None):
    lebenszeichen()
    if STILL:
        return
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


def archiv_privat() -> list:
    return list(A.ARCHIV_PRIVAT) + ([] if EINKAUF_KAT in A.ARCHIV_PRIVAT else [EINKAUF_KAT])


def konfig() -> dict:
    return {
        "empfaenger": A.EMPFAENGER,
        "archiv": {"Privat": archiv_privat(), "Geschaeftlich": A.ARCHIV_GESCHAEFTLICH},
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


def iso_datum(v, ref=None, info=None) -> str:
    """Datum -> JJJJ-MM-TT. Unplausible Jahre (z. B. 0002) gelten als nicht erkannt.
    Mit ref (Scan-Datum) wird ein fehlendes oder unlesbares Jahr ergaenzt: das letzte passende vor dem Scan."""
    s = str(v or "").strip()
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?(?!\d)", s)  # 14.10.2026 / 14.10.26 / 14.10. (Kassenbons)
    i = re.match(r"(\d{1,4})-(\d{1,2})-(\d{1,2})(?!\d)", s)  # 2026-10-17, auch kaputt wie 0002-10-17
    if m:
        t, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        y = (int(y) % 100 + 2000 if len(y) == 2 else int(y)) if y else None
    elif i:
        y, mo, t = int(i.group(1)), int(i.group(2)), int(i.group(3))
    else:
        d = A.format_date(s)
        if len(d) != 8:
            return ""
        y, mo, t = int(d[:4]), int(d[4:6]), int(d[6:8])
    if not y or not 1990 <= y <= 2100:
        if ref is None:
            return ""
        y = ref.year
        try:
            if datetime(y, mo, t) > ref:
                y -= 1
        except ValueError:
            return ""
        if info is not None:
            info.append("jahr")
    try:
        datetime(y, mo, t)
    except ValueError:
        return ""
    return f"{y:04d}-{mo:02d}-{t:02d}"


def datum_ok(d) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d or ""))) and 1990 <= int(str(d)[:4]) <= 2100


def normalisiere(m, ref=None) -> dict:
    """ref: Scan-Datum (Aenderungszeit der PDF) - nur bei frisch analysierten Kassenbons fuer fehlende Daten."""
    m = dict(m or {})
    ist_bon = isinstance(m.get("kassenbon"), dict)
    info = []
    out = {}
    for k in ("empfaenger", "absender", "betreff", "archiv_bereich", "archiv_kategorie",
              "konfidenz", "hinweise", "steuer_begruendung"):
        v = m.get(k)
        out[k] = "" if A.is_empty(v) else str(v).strip()
    out["datum"] = iso_datum(m.get("datum"), ref if ist_bon else None, info)
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
    da = m.get("dokumentart")
    out["dokumentart"] = None if A.is_empty(da) else str(da).strip()[:40]
    out["faellig"] = iso_datum(m.get("faellig")) or None
    out["referenzen"] = norm_refs(m.get("referenzen"))
    out["kfz"] = norm_kfz(m.get("kfz"))
    bon = normalisiere_bon(m.get("kassenbon"), out, ref, info)
    out["kassenbon"] = bon
    if bon:
        if not bon["datum"] and ref is not None:  # Kaufdatum gar nicht lesbar -> Scan-Datum
            bon["datum"] = ref.strftime("%Y-%m-%d")
            info.append("scan")
        if not out["datum"]:
            out["datum"] = bon["datum"]
            out["jahr"] = out["jahr"] or (int(bon["datum"][:4]) if bon["datum"] else None)
        if out["betrag"] is None:
            out["betrag"] = bon["summe"]
        if out["zahlbetrag"] is None:
            out["zahlbetrag"] = bon["summe"]
        if not out["absender"] or einfach(bon["laden"]) != einfach((m.get("kassenbon") or {}).get("laden")):
            out["absender"] = A.clean_text(bon["laden"])  # eigener Ladenname aus dem Cockpit gilt auch fuer den Dateinamen
        if info:  # Datum ergaenzt -> nicht automatisch ablegen, im Cockpit pruefen
            d = bon["datum"]
            out["datum"], out["jahr"] = d, int(d[:4])
            text = (f"Kaufdatum nicht lesbar - Scan-Datum {d[8:]}.{d[5:7]}.{d[:4]} eingesetzt, bitte pruefen." if "scan" in info
                    else f"Jahr auf dem Bon nicht lesbar - {d[:4]} angenommen, bitte pruefen.")
            out["hinweise"] = (text + " " + out["hinweise"]).strip()
            out["datum_unsicher"] = True
    return out


REF_ARTEN = ("vertrag", "versicherungsschein", "kunde", "rechnung", "mitglied", "zaehler", "sonst")


def norm_refs(v) -> list:
    """Nummern fuer die Zuordnung; Steuer-IDs, IBAN, Konto- und Kartennummern werden verworfen."""
    out = []
    for r in v if isinstance(v, list) else []:
        if not isinstance(r, dict):
            continue
        art = str(r.get("art") or "sonst").strip().lower()
        wert = str(r.get("wert") or "").strip()[:40]
        kompakt = re.sub(r"[\s.-]", "", wert).upper()
        if not wert or A.is_empty(wert) or len(re.sub(r"\D", "", wert)) < 3:
            continue
        if "steuer" in art or re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", kompakt) or re.fullmatch(r"\d{13,19}", kompakt):
            continue
        if not any(x["wert"] == wert for x in out):
            out.append({"art": art if art in REF_ARTEN else "sonst", "wert": wert})
    return out[:5]


def norm_kfz(v):
    if not isinstance(v, dict):
        return None
    kz = re.sub(r"\s+", " ", str(v.get("kennzeichen") or "").upper()).strip()
    if A.is_empty(kz) or not re.fullmatch(r"[A-ZÄÖÜ]{1,3}[ -]?[A-Z]{1,2}[ -]?\d{1,4}[EH]?", kz):
        kz = None
    try:
        km = int(float(str(v.get("km")).replace(".", "").replace(",", ".")))
        km = km if 0 < km < 2_000_000 else None
    except (TypeError, ValueError):
        km = None
    hu = iso_datum(v.get("hu_datum")) or None
    m = re.search(r"(\d{4})-(\d{1,2})|(\d{1,2})[./](\d{4})", str(v.get("hu_naechste") or ""))
    nae = None
    if m:
        y, mo = (int(m.group(1)), int(m.group(2))) if m.group(1) else (int(m.group(4)), int(m.group(3)))
        nae = f"{y:04d}-{mo:02d}" if 1990 <= y <= 2100 and 1 <= mo <= 12 else None
    o = {k: x for k, x in (("kennzeichen", kz), ("km", km), ("hu_datum", hu), ("hu_naechste", nae)) if x}
    return o or None


def einfach(s) -> str:
    s = str(s or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def kat_nummer(v) -> int:
    if isinstance(v, bool):
        return KAT_SONST
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, int):
        return v if 0 <= v < len(KAT_EINKAUF) else KAT_SONST
    s = einfach(v)
    if not s:
        return KAT_SONST
    namen = [einfach(k) for k in KAT_EINKAUF]
    if s in namen:
        return namen.index(s)
    for i, k in enumerate(namen):  # z. B. "Getraenke" oder "Pfand"
        if k.startswith(s) or s.split()[0] == k.split()[0]:
            return i
    return KAT_SONST


def zahlart(v) -> str:
    s = einfach(v)
    if s in ("bar", "karte", "sonstiges", "unbekannt"):
        return s
    if re.search(r"(karte|\bgiro|\bec\b|maestro|v ?pay|visa|master|kredit|debit|kontaktlos|apple|google)", s):
        return "karte"  # zuerst, wegen "EC-Cash"
    if re.search(r"\b(bar\w*|cash|gegeben|rueckgeld)\b", s):
        return "bar"
    return "sonstiges" if s in ("gutschein", "app", "paypal", "rechnung") else "unbekannt"


_ALIASE = None


def laden_aliase() -> dict:
    """Eigene Ladennamen aus dem Cockpit (_cockpit/laeden.json): vereinfachter gelesener Name -> Name."""
    global _ALIASE
    if _ALIASE is None:
        d = lies_json(KANAL / "laeden.json", {})
        _ALIASE = {einfach(k): str(v).strip() for k, v in (d.get("aliase") or {}).items() if str(v).strip()}
    return _ALIASE


def laden_name(name) -> str:
    return laden_aliase().get(einfach(name), name)


def normalisiere_bon(b, meta: dict, ref=None, info=None):
    """Kassenbon-Daten der KI (oder schon normalisiert aus dem Cockpit) in eine kompakte Form bringen.
    Artikel: [Name, Zeilenbetrag, Warengruppe (Nummer in KAT_EINKAUF), Menge]."""
    if not isinstance(b, dict):
        return None
    artikel = []
    for a in b.get("artikel") or []:
        if isinstance(a, (list, tuple)) and len(a) >= 2:
            name, preis = a[0], zahl(a[1])
            kat = a[2] if len(a) > 2 else None
            menge = a[3] if len(a) > 3 else 1
        elif isinstance(a, dict):
            name = a.get("name")
            preis = zahl(a.get("preis") if a.get("preis") is not None else a.get("betrag"))
            kat, menge = a.get("kategorie"), a.get("menge")
        else:
            continue
        name = re.sub(r"\s+", " ", str(name or "")).strip()[:60]
        if not name or preis is None:
            continue
        mg = zahl(menge)
        artikel.append([name, preis, kat_nummer(kat), mg if mg and mg > 0 else 1])
    summe = zahl(b.get("summe"))
    if summe is None and artikel:
        summe = round(sum(x[1] for x in artikel), 2)
    # Barzahlung: wurde der gegebene Betrag als Summe gelesen? -> Gegeben minus Rueckgeld bzw. Summe der Positionen
    gegeben, rueck = zahl(b.get("gegeben")), zahl(b.get("rueckgeld"))
    korrigiert = None
    if summe is not None and gegeben and abs(summe - gegeben) < 0.01:
        if rueck and rueck > 0:
            summe, korrigiert = round(gegeben - rueck, 2), "gegeben-rueckgeld"
        elif artikel:
            pos = round(sum(x[1] for x in artikel), 2)
            if 0 < pos < summe - 0.5:
                summe, korrigiert = pos, "positionen"
    if summe is None:
        return None
    zeit = re.match(r"\s*(\d{1,2})[:.](\d{2})", str(b.get("zeit") or ""))
    laden = laden_name(re.sub(r"\s+", " ", str(b.get("laden") or "")).strip()[:40] or str(meta.get("absender") or "").replace("_", " "))
    karte = b.get("karte")
    ort = b.get("ort")
    out = {
        "laden": laden,
        "ort": "" if A.is_empty(ort) else str(ort).strip()[:40],
        "datum": iso_datum(b.get("datum"), ref, info) or meta.get("datum") or "",
        "zeit": f"{int(zeit.group(1)):02d}:{zeit.group(2)}" if zeit else "",
        "summe": summe,
        "zahlart": zahlart(b.get("zahlart")),
        "karte": "" if A.is_empty(karte) else str(karte).strip()[:20],
        "artikel": artikel,
    }
    if korrigiert:
        out["korrigiert"] = korrigiert  # Summe war der gegebene Betrag -> korrigiert
    if artikel:
        diff = round(sum(x[1] for x in artikel) - summe, 2)
        if abs(diff) > 0.05:
            out["diff"] = diff  # Positionen ergeben nicht die Summe -> im Cockpit markiert
    return out


def gueltig(meta: dict):
    if meta.get("datum") and not datum_ok(meta["datum"]):
        return False, f"Datum pruefen: {meta.get('datum')}"
    if meta.get("kassenbon") and not meta.get("datum"):
        return False, "Kaufdatum fehlt"
    if meta.get("archiv_bereich") not in ("Privat", "Geschaeftlich"):
        return False, f"Ungueltiger Bereich: {meta.get('archiv_bereich')}"
    kats = archiv_privat() if meta["archiv_bereich"] == "Privat" else A.ARCHIV_GESCHAEFTLICH
    if meta.get("archiv_kategorie") not in kats:
        return False, f"Ungueltige Kategorie: {meta.get('archiv_kategorie')}"
    if meta.get("steuerrelevant"):
        arten = A.STB_PRIVAT if meta["archiv_bereich"] == "Privat" else A.STB_GESCHAEFTLICH
        if meta.get("stb_belegart") not in arten:
            return False, f"Ungueltige StB-Belegart: {meta.get('stb_belegart')}"
    return True, ""


def eintrag(meta: dict, ziel: Path, stb, quelle: str, md5=None) -> dict:
    ra = rel(ziel)
    st = bool(meta.get("steuerrelevant"))
    e = {
        "id": hashlib.sha1(ra.encode("utf-8")).hexdigest()[:12],
        "datei": ziel.name, "archiv": ra, "stb": stb,
        "datum": meta.get("datum") or "", "empfaenger": meta.get("empfaenger") or "",
        "st": st, "absender": meta.get("absender") or "", "betreff": meta.get("betreff") or "",
        "bereich": meta.get("archiv_bereich") or "", "kategorie": meta.get("archiv_kategorie") or "",
        "belegart": meta.get("stb_belegart") if st else None,
        "betrag": meta.get("betrag"), "zahlbetrag": meta.get("zahlbetrag"), "jahr": meta.get("jahr"),
        "abgelegt": jetzt(), "quelle": quelle,
    }
    if md5:
        e["md5"] = md5
        try:
            e["groesse"] = ziel.stat().st_size
        except OSError:
            pass
    if meta.get("kassenbon"):
        e["zahlart"] = meta["kassenbon"].get("zahlart") or "unbekannt"
    zusatz(e, meta)
    return e


def zusatz(e: dict, meta: dict):
    """Angaben fuer die Zuordnung im Cockpit (nur wenn vorhanden)."""
    for k, q in (("art", "dokumentart"), ("faellig", "faellig"), ("refs", "referenzen"), ("kfz", "kfz")):
        if meta.get(q):
            e[k] = meta[q]


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


# Kassenbons: _cockpit/einkaeufe.json (Laden, Datum, Summe, Zahlart, Artikel) fuer die Einkaufs-Statistik im Cockpit
def lade_einkaeufe() -> dict:
    d = lies_json(KANAL / "einkaeufe.json", {})
    return {b["id"]: b for b in d.get("bons", []) if isinstance(b, dict) and b.get("id")}


def speichere_einkaeufe(m: dict):
    liste = sorted(m.values(), key=lambda b: (b.get("datum") or "", b.get("zeit") or "", b.get("id")), reverse=True)
    schreibe_json(KANAL / "einkaeufe.json", {"version": 1, "aktualisiert": jetzt(), "kategorien": KAT_EINKAUF, "bons": liste}, kompakt=True)


def bon_doppelt(eink: dict, bon: dict):
    """Derselbe Bon schon erfasst? (gleicher Laden, Tag, Uhrzeit und Betrag)"""
    k = (einfach(laden_name(bon.get("laden"))), bon.get("datum"), bon.get("zeit") or "", bon.get("summe"))
    for b in eink.values():
        if (einfach(laden_name(b.get("laden"))), b.get("datum"), b.get("zeit") or "", b.get("summe")) == k:
            return b
    return None


def bon_eintragen(eink: dict, meta: dict, e: dict):
    bon = meta.get("kassenbon")
    if not bon:
        return
    alt = bon_doppelt(eink, bon)
    if alt and alt["id"] != e["id"]:
        del eink[alt["id"]]
    eink[e["id"]] = dict(bon, id=e["id"], archiv=e["archiv"], abgelegt=e["abgelegt"])


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
        max_tokens=4096,
        system=A.SYSTEM_PROMPT + ZUSATZ,
        messages=[{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": daten}},
            {"type": "text", "text": "Analysiere dieses Dokument und antworte mit reinem JSON ohne Codefences."},
        ]}],
    )
    return normalisiere(A.extract_json(antwort.content[0].text), ref=datetime.fromtimestamp(pdf.stat().st_mtime))


def cmd_analyse(id_):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise Fehler("Umgebungsvariable ANTHROPIC_API_KEY ist nicht gesetzt (siehe Einrichtung).")
    if not A.EINGANG.exists():
        raise Fehler(f"Eingangsordner existiert nicht: {A.EINGANG}")
    z = zaehlerfotos(None)
    if z["unklar"]:
        hm = lies_json(KANAL / "hausmeister.json", {})
        hm["fotos_unklar"] = z["unklar_namen"]
        schreibe_json(KANAL / "hausmeister.json", hm)
    erg = analyse_eingang(id_)
    if z["gelesen"] or z["unklar"]:
        teile = [f"{z['gelesen']} Zaehlerfoto(s) gelesen - in Energie uebernehmen"] if z["gelesen"] else []
        if z["unklar"]:
            teile.append(f"{z['unklar']} Foto(s) ohne erkennbaren Zaehler bleiben im Eingang")
        erg["meldung"] = erg["meldung"].rstrip(".") + ", " + ", ".join(teile) + "."
        erg["zaehlerfotos"] = z["gelesen"]
    return erg


def analyse_eingang(id_, stopp=None, neu_namen=None) -> dict:
    """PDFs im Eingang analysieren (nur neue/geaenderte). stopp(): True -> abbrechen (Vorrang fuer einen Lauf aus dem Cockpit)."""
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
    idx = lade_index()
    if index_hashes(idx):
        speichere_index(idx)
    nach_md5 = {e["md5"]: e for e in idx.values() if e.get("md5")}
    im_eingang = {}
    client = None
    fehler, bons, doppelt, n_fertig = 0, 0, 0, 0
    eink, log = None, [f"--- Kassenbons automatisch abgelegt {jetzt()} ---"]
    for i, (p, sig) in enumerate(offen, 1):
        if stopp and stopp():
            break
        n_fertig = i
        print(f"  [{i:3}/{len(offen)}] {p.name[:52]:<52} ", end="", flush=True)
        try:
            h = datei_md5(p)
            gleich = nach_md5.get(h)
            if gleich or h in im_eingang:
                # dieselbe Datei liegt schon im Archiv (oder zweimal im Eingang): ohne KI-Aufruf als Dublette melden
                meta = meta_aus_eintrag(gleich) if gleich else dict(dateien[im_eingang[h]].get("meta") or {})
                wo = gleich["archiv"] if gleich else f"00_Eingang/{im_eingang[h]}"
                meta.update({"doppelt": wo, "doppelt_art": "gleich",
                             "hinweise": f"Diese Datei liegt schon {'im Archiv' if gleich else 'im Eingang'}: {wo} - nicht noch einmal ablegen."})
                dateien[p.name] = dict(sig, meta=meta, analysiert=jetzt(), fehler=None, pruefen="Dublette", md5=h)
                doppelt += 1
                print("DUBLETTE")
                speichere_vorschlaege(dateien)
                continue
            im_eingang[h] = p.name
            if client is None:
                client = A.Anthropic()
            meta = analysiere(client, p)
            ok, grund = gueltig(meta)
            aehnlich = aehnliches_dokument(meta, idx)
            if aehnlich:
                meta.update({"doppelt": aehnlich["archiv"], "doppelt_art": "aehnlich",
                             "hinweise": (f"Gleiches Datum und gleicher Betrag wie {aehnlich['archiv']} - vermutlich derselbe Brief. "
                                          + meta.get("hinweise", "")).strip()})
                doppelt += 1
            bon = meta.get("kassenbon")
            if bon and ok and not aehnlich:
                if eink is None:
                    eink = lade_einkaeufe()
                alt_bon = bon_doppelt(eink, bon)
                if alt_bon:
                    meta["doppelt"] = alt_bon.get("archiv")
                    meta["doppelt_art"] = "gleich"
                    meta["hinweise"] = (f"Dieser Kassenbon ist schon erfasst ({alt_bon.get('archiv')}) - den Scan am besten loeschen. "
                                        + meta.get("hinweise", "")).strip()
                elif bon_sicher(meta):
                    # sichere Kassenbons ohne Rueckfrage ablegen - sie erscheinen direkt in der Einkaufs-Statistik
                    e = lege_ab(meta, p)
                    idx[e["archiv"]] = e
                    nach_md5[h] = e
                    bon_eintragen(eink, meta, e)
                    speichere_index(idx)
                    speichere_einkaeufe(eink)
                    log.append(f"[OK] {p.name} -> {e['archiv']} | Kassenbon {bon['laden']} {bon['summe']:.2f} EUR {bon['zahlart']}")
                    bons += 1
                    print("KASSENBON abgelegt")
                    status(id_, "analyse", "laeuft", f"{i} von {len(offen)} analysiert", fortschritt={"i": i, "n": len(offen)})
                    continue
            pruefen = None if ok else grund
            if meta.get("doppelt") and not pruefen:
                pruefen = "Dublette?"
            dateien[p.name] = dict(sig, meta=meta, analysiert=jetzt(), fehler=None, pruefen=pruefen, md5=h)
            if neu_namen is not None:
                neu_namen.add(p.name)
            print(("KASSENBON " if bon else "") + ("DUBLETTE? " if meta.get("doppelt") else "") + ("OK" if ok else "PRUEFEN"))
        except Exception as e:  # noqa: BLE001 - weiter mit dem naechsten Dokument
            fehler += 1
            dateien[p.name] = dict(sig, meta=None, analysiert=jetzt(), fehler=f"{type(e).__name__}: {e}"[:300], pruefen=None)
            print("FEHLER")
        speichere_vorschlaege(dateien)
        status(id_, "analyse", "laeuft", f"{i} von {len(offen)} analysiert", fortschritt={"i": i, "n": len(offen)})
    speichere_vorschlaege(dateien)
    if bons:
        protokoll(log)
    rest = n_fertig - fehler - bons
    teile = []
    if bons:
        teile.append(f"{bons} Kassenbon(s) direkt abgelegt")
    if rest > 0:
        teile.append(f"{rest} Dokument(e) analysiert - jetzt im Cockpit pruefen und freigeben")
    if doppelt:
        teile.append(f"davon {doppelt} vermutlich schon abgelegt")
    if fehler:
        teile.append(f"{fehler} Fehler")
    if n_fertig < len(offen):
        teile.append(f"{len(offen) - n_fertig} noch offen")
    return {"meldung": (", ".join(teile) or "Fertig") + ".", "dateien": len(pdfs), "neu": n_fertig, "fehler": fehler,
            "kassenbons": bons, "dubletten": doppelt}


# =============================================================================
# Dubletten
# =============================================================================

def datei_md5(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def index_hashes(idx: dict) -> bool:
    """md5 und Groesse der abgelegten PDFs im Verzeichnis nachtragen (einmalig, danach nur fuer neue/geaenderte Dateien)."""
    neu = False
    for e in idx.values():
        p = ROOT / e["archiv"]
        try:
            g = p.stat().st_size
        except OSError:
            continue
        if e.get("md5") and e.get("groesse") == g:
            continue
        try:
            e["md5"], e["groesse"] = datei_md5(p), g
            neu = True
        except OSError:
            pass
    return neu


STOPP_WORTE = {"gmbh", "mbh", "und", "der", "die", "das", "co", "kg", "ag", "se", "von", "fuer"}


def absender_wort(s) -> str:
    w = [x for x in einfach(s).split() if len(x) >= 3 and x not in STOPP_WORTE]
    return w[0] if w else ""


def aehnliches_dokument(meta: dict, idx: dict):
    """Schon abgelegt? Gleiches Datum, gleicher Betrag und gleicher Absender (erstes markantes Wort)."""
    b = meta.get("betrag") if meta.get("betrag") is not None else meta.get("zahlbetrag")
    d, w = meta.get("datum"), absender_wort(meta.get("absender"))
    if b is None or not d or not w:
        return None
    for e in idx.values():
        eb = e.get("betrag") if e.get("betrag") is not None else e.get("zahlbetrag")
        if e.get("datum") != d or eb is None or abs(abs(float(eb)) - abs(float(b))) > 0.011:
            continue
        txt = " " + einfach(" ".join(str(e.get(k) or "") for k in ("absender", "ki_absender", "betreff", "datei"))) + " "
        if f" {w} " in txt:
            return e
    return None


def meta_aus_eintrag(e: dict) -> dict:
    """Vorschlag fuer eine Dublette aus dem vorhandenen Verzeichniseintrag (ohne KI-Aufruf)."""
    return {"datum": e.get("datum") or "", "absender": e.get("absender") or e.get("ki_absender") or "", "betreff": e.get("betreff") or "",
            "empfaenger": e.get("empfaenger") or "", "archiv_bereich": e.get("bereich") or "", "archiv_kategorie": e.get("kategorie") or "",
            "steuerrelevant": bool(e.get("st")), "stb_belegart": e.get("belegart"), "betrag": e.get("betrag"), "zahlbetrag": e.get("zahlbetrag"),
            "jahr": e.get("jahr"), "konfidenz": "hoch", "hinweise": "", "kassenbon": None}


def verwerfen(name: str) -> str:
    """Dublette aus dem Eingang nach _Doppelt_pruefen/00_Eingang verschieben (nichts wird geloescht)."""
    src = A.EINGANG / name
    zdir = ROOT / "_Doppelt_pruefen" / "00_Eingang"
    zdir.mkdir(parents=True, exist_ok=True)
    ziel = A.ensure_unique(zdir / name)
    shutil.move(str(src), str(ziel))
    return rel(ziel)


def bon_sicher(meta: dict) -> bool:
    """Kassenbon ohne Rueckfrage ablegen? Nur bei sicherer Erkennung und ohne Steuerbezug."""
    bon = meta.get("kassenbon") or {}
    return (meta.get("konfidenz") in ("hoch", "mittel") and not meta.get("steuerrelevant") and not meta.get("datum_unsicher")
            and bool(bon.get("datum")) and bon.get("summe") is not None and bool(bon.get("laden")))


def lege_ab(meta: dict, src: Path, quelle="cockpit") -> dict:
    md5 = datei_md5(src)
    name = A.build_filename(meta)
    adir = A.ARCHIV / meta["archiv_bereich"] / meta["archiv_kategorie"]
    if meta["archiv_kategorie"] == EINKAUF_KAT:  # viele Bons -> Unterordner je Jahr
        adir = adir / str(meta.get("jahr") or (meta.get("datum") or "")[:4] or datetime.now().year)
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
    return eintrag(meta, ziel, stb, quelle, md5)


def cmd_ablegen(id_):
    auftrag = lies_json(KANAL / "auftrag.json", None)
    if not auftrag or not auftrag.get("dokumente"):
        raise Fehler("Kein Auftrag vom Cockpit gefunden (auftrag.json fehlt oder ist leer).")
    if id_ and auftrag.get("id") and auftrag["id"] != id_:
        raise Fehler("Der Auftrag passt nicht zu diesem Aufruf - bitte im Cockpit erneut auf Ablegen tippen.")
    idx = lade_index()
    eink = lade_einkaeufe()
    v = lade_vorschlaege()["dateien"]
    erg, ok_n = [], 0
    log = [f"--- Ablage aus dem Cockpit {jetzt()} ---"]
    for d in auftrag["dokumente"]:
        name = Path(str(d.get("datei", ""))).name  # nur Dateinamen, keine Pfade
        src = A.EINGANG / name
        if d.get("verwerfen"):
            if name and src.is_file():
                ziel = verwerfen(name)
                v.pop(name, None)
                erg.append({"datei": name, "ok": True, "ziel": ziel, "verworfen": True})
                log.append(f"[DUBLETTE] {name} -> {ziel}")
                print(f"  {name[:52]:<52} DUBLETTE verschoben")
            continue
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
            bon_eintragen(eink, meta, e)
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
    if any(d.get("meta", {}) and (d.get("meta") or {}).get("kassenbon") for d in auftrag["dokumente"]):
        speichere_einkaeufe(eink)
    speichere_vorschlaege(v)
    try:
        (KANAL / "auftrag.json").unlink()
    except FileNotFoundError:
        pass
    protokoll(log)
    n_verw = sum(1 for x in erg if x.get("verworfen"))
    n_err = len(erg) - ok_n - n_verw
    return {"meldung": f"{ok_n} Dokument(e) abgelegt" + (f", {n_verw} Dublette(n) nach _Doppelt_pruefen verschoben" if n_verw else "")
            + (f", {n_err} nicht abgelegt" if n_err else "") + ".",
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
    # Kassenbons, deren PDF es nicht mehr gibt, aus der Einkaufs-Statistik nehmen
    eink = lade_einkaeufe()
    alt = [k for k, b in eink.items() if b.get("archiv") not in gefunden]
    if alt:
        for k in alt:
            del eink[k]
        speichere_einkaeufe(eink)
    print(f"  {len(gefunden)} Dokument(e) im Archiv, {neu} neu aufgenommen, {len(weg)} nicht mehr vorhanden.")
    return {"meldung": f"Verzeichnis aktualisiert: {len(gefunden)} Dokumente ({neu} neu, {len(weg)} entfernt).",
            "gesamt": len(gefunden), "neu": neu, "entfernt": len(weg)}


def lies_nach(client, pdf: Path) -> dict:
    daten = base64.standard_b64encode(pdf.read_bytes()).decode("utf-8")
    antwort = client.messages.create(
        model=A.MODEL,
        max_tokens=1024,
        system=NACHLESEN_SYSTEM,
        messages=[{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": daten}},
            {"type": "text", "text": "Lies die Angaben aus und antworte mit reinem JSON."},
        ]}],
    )
    return normalisiere(A.extract_json(antwort.content[0].text))


def braucht_nachlesen(e: dict) -> bool:
    """Altbestand (nur Dateiname) und frueher abgelegte Dokumente ohne Zuordnungs-Angaben (Rechnungsnummer, Faelligkeit)."""
    if e.get("nachgelesen") or e.get("kategorie") == EINKAUF_KAT:
        return False
    if e.get("quelle") == "bestand":
        return True
    return e.get("quelle") == "cockpit" and not any(k in e for k in ("art", "refs", "faellig"))


def cmd_nachlesen(id_):
    """Altbestand (nur ueber den Dateinamen ins Verzeichnis aufgenommen) einmal inhaltlich auslesen.
    Titel, Kategorie und Ablageort bleiben unveraendert; nach jedem Dokument wird gespeichert,
    ein Abbruch (Fenster schliessen) ist jederzeit moeglich - der naechste Lauf macht weiter."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise Fehler("Umgebungsvariable ANTHROPIC_API_KEY ist nicht gesetzt (siehe Einrichtung).")
    idx = lade_index()
    offen = [e for e in idx.values() if braucht_nachlesen(e)]
    offen.sort(key=lambda e: e.get("datum") or "", reverse=True)  # neueste zuerst - die sind fuer die Zuordnung am wichtigsten
    if not offen:
        return {"meldung": "Alle Dokumente sind bereits ausgelesen.", "neu": 0, "fehler": 0}
    print(f"  {len(offen)} Dokument(e) werden ausgelesen (die Dateien bleiben, wo sie sind).")
    print("  Abbrechen: Fenster schliessen - der naechste Lauf macht an der Stelle weiter.\n")
    client = A.Anthropic()
    ok = fehler = betraege = 0
    for i, e in enumerate(offen, 1):
        p = ROOT / e["archiv"]
        print(f"  [{i:3}/{len(offen)}] {p.name[:56]:<56} ", end="", flush=True)
        if not p.is_file():
            print("FEHLT")
            continue
        try:
            m = lies_nach(client, p)
            for k in ("betrag", "zahlbetrag"):
                if e.get(k) is None and m.get(k) is not None:
                    e[k] = m[k]
            if not e.get("jahr") and m.get("jahr"):
                e["jahr"] = m["jahr"]
            if not e.get("datum") and m.get("datum"):
                e["datum"] = m["datum"]
            if m.get("absender") and not e.get("absender"):
                e["ki_absender"] = m["absender"]  # Titel bleibt wie im Dateinamen
            zusatz(e, m)
            e["nachgelesen"] = jetzt()
            e.pop("nachlesen_fehler", None)
            ok += 1
            betraege += e.get("betrag") is not None
            print("OK" + (f"  {e['betrag']:.2f} EUR" if e.get("betrag") is not None else ""))
        except Exception as ex:  # noqa: BLE001 - weiter mit dem naechsten Dokument
            fehler += 1
            e["nachlesen_versuche"] = int(e.get("nachlesen_versuche") or 0) + 1
            e["nachlesen_fehler"] = f"{type(ex).__name__}: {ex}"[:200]
            if e["nachlesen_versuche"] >= 2:  # dauerhaft unlesbar -> nicht endlos wiederholen
                e["nachgelesen"] = jetzt()
            print("FEHLER")
        speichere_index(idx)
        status(id_, "nachlesen", "laeuft", f"{i} von {len(offen)} ausgelesen", fortschritt={"i": i, "n": len(offen)})
    protokoll([f"--- Altbestand ausgelesen {jetzt()}: {ok} OK, {betraege} mit Betrag, {fehler} Fehler ---"])
    return {"meldung": f"{ok} Dokument(e) ausgelesen, davon {betraege} mit Betrag" + (f", {fehler} Fehler" if fehler else "") + ".",
            "neu": ok, "betraege": betraege, "fehler": fehler}



# =============================================================================
# Zaehlerfotos: Foto vom Gas-, Wasser- oder Stromzaehler in den Eingang -> Stand fuers Cockpit (Energie)
# =============================================================================

BILD_TYPEN = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
ZAEHLER_SYSTEM = """Du liest auf einem Foto den Stand eines Verbrauchszaehlers ab (Haushalt in Deutschland).
Antworte NUR mit JSON:
{"zaehlerfoto": true/false,          // false, wenn kein Zaehler mit lesbarem Zaehlwerk zu sehen ist
 "art": "gas" | "wasser" | "strom" | "waerme" | "sonst",
 "nummer": "Zaehlernummer bzw. Seriennummer wie aufgedruckt (z.B. 1ESY1160123456, 7GMT0012345678) oder null",
 "stand": Zahl mit Punkt als Dezimaltrenner,
 "einheit": "m3" | "kWh" | "MWh" | null,
 "obis": "1.8.0" (Bezug) | "2.8.0" (Einspeisung) | null,
 "unsicher": true/false,             // true, wenn Ziffern verdeckt, verwackelt oder nicht eindeutig sind
 "hinweis": "kurz, nur wenn etwas auffaellt, sonst leer"}
Regeln:
- Mechanische Rollenzaehlwerke: schwarze/weisse Rollen sind ganze Einheiten, rote Rollen bzw. Stellen hinter dem
  Komma sind Nachkommastellen (Gas meist 3 rote Stellen, Wasser haeufig 3 rote Stellen bzw. Zeiger).
- Digitale Stromzaehler zeigen oft abwechselnd 1.8.0 (Bezug) und 2.8.0 (Einspeisung) - lies das angezeigte Register.
- Bei mehreren Zaehlern im Bild den groessten, deutlich lesbaren nehmen und "unsicher": true setzen."""


def exif_datum(daten: bytes):
    """Aufnahmezeit aus den EXIF-Daten eines JPEG (DateTimeOriginal, sonst DateTime) als datetime oder None."""
    import struct
    try:
        if daten[:2] != b"\xff\xd8":
            return None
        i = 2
        while i + 4 < len(daten):
            if daten[i] != 0xFF:
                return None
            marker, laenge = daten[i + 1], struct.unpack(">H", daten[i + 2:i + 4])[0]
            if marker == 0xE1 and daten[i + 4:i + 10] == b"Exif\x00\x00":
                t = daten[i + 10:i + 2 + laenge]
                bo = "<" if t[:2] == b"II" else ">"
                def ifd(off):
                    n = struct.unpack(bo + "H", t[off:off + 2])[0]
                    out = {}
                    for k in range(n):
                        e = off + 2 + 12 * k
                        tag, typ, cnt, val = struct.unpack(bo + "HHI4s", t[e:e + 12])
                        if typ == 2:
                            vo = struct.unpack(bo + "I", val)[0] if cnt > 4 else None
                            out[tag] = (t[vo:vo + cnt] if vo is not None else val[:cnt]).rstrip(b"\x00").decode("ascii", "ignore")
                        elif typ == 4:
                            out[tag] = struct.unpack(bo + "I", val)[0]
                    return out
                ifd0 = ifd(struct.unpack(bo + "I", t[4:8])[0])
                werte = []
                if 0x8769 in ifd0:
                    werte.append(ifd(ifd0[0x8769]).get(0x9003))
                werte.append(ifd0.get(0x0132))
                for w in werte:
                    if w and re.match(r"\d{4}:\d\d:\d\d \d\d:\d\d", w):
                        return datetime.strptime(w[:16], "%Y:%m:%d %H:%M")
                return None
            if marker == 0xDA:
                return None
            i += 2 + laenge
    except Exception:  # noqa: BLE001 - kaputte EXIF-Daten sind kein Fehler
        return None
    return None


def foto_datum(p: Path, daten: bytes) -> datetime:
    d = exif_datum(daten)
    if d:
        return d
    m = re.search(r"(20\d\d)[-_]?([01]\d)[-_]?([0-3]\d)[-_ ]?([0-2]\d)?[-_.]?([0-5]\d)?", p.name)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4) or 12), int(m.group(5) or 0))
        except ValueError:
            pass
    return datetime.fromtimestamp(p.stat().st_mtime)


def bild_verkleinern(daten: bytes, typ: str):
    """Grosse Fotos fuer die API verkleinern (nur wenn Pillow installiert ist)."""
    if len(daten) <= 3_500_000:
        return daten, typ
    try:
        from io import BytesIO
        from PIL import Image
        im = Image.open(BytesIO(daten))
        im.thumbnail((1800, 1800))
        buf = BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=85)
        return buf.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001
        return daten, typ


def zaehler_zahl(v):
    """Zaehlerstand mit bis zu drei Nachkommastellen (12345.678 bzw. "12.345,678")."""
    if isinstance(v, (int, float)):
        return round(float(v), 3)
    t = re.sub(r"[^0-9,.]", "", str(v or ""))
    if not t:
        return None
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif t.count(".") > 1:
        t = t.replace(".", "")
    try:
        return round(float(t), 3)
    except ValueError:
        return None


def lies_zaehler(client, bild: Path, daten: bytes) -> dict:
    roh, typ = bild_verkleinern(daten, BILD_TYPEN[bild.suffix.lower()])
    if len(roh) > 4_900_000:
        raise Fehler("Foto zu gross (ueber 5 MB) - bitte kleiner aufnehmen oder Pillow installieren")
    antwort = client.messages.create(
        model=A.MODEL, max_tokens=400, system=ZAEHLER_SYSTEM,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": typ, "data": base64.standard_b64encode(roh).decode("utf-8")}},
            {"type": "text", "text": "Lies den Zaehlerstand ab und antworte mit reinem JSON."},
        ]}],
    )
    m = A.extract_json(antwort.content[0].text) or {}
    stand = zaehler_zahl(m.get("stand"))
    art = str(m.get("art") or "sonst").lower()
    nummer = re.sub(r"\s+", "", str(m.get("nummer") or "")) or None
    obis = m.get("obis") if m.get("obis") in ("1.8.0", "2.8.0") else None
    return {"zaehlerfoto": bool(m.get("zaehlerfoto")) and stand is not None,
            "art": art if art in ("gas", "wasser", "strom", "waerme") else "sonst", "nummer": nummer,
            "stand": stand, "einheit": m.get("einheit") if m.get("einheit") in ("m3", "kWh", "MWh") else None,
            "obis": obis, "unsicher": bool(m.get("unsicher")), "hinweis": str(m.get("hinweis") or "")[:200]}


def zaehlerfotos(stopp=None) -> dict:
    """Fotos im Eingang lesen. Zaehlerfotos wandern nach 02_Archiv/Privat/Energie_PV/Zaehlerfotos/<Jahr>/,
    der Stand kommt nach _cockpit/zaehlerstaende.json. Andere Fotos bleiben im Eingang."""
    bilder = sorted(p for p in A.EINGANG.glob("*") if p.is_file() and p.suffix.lower() in BILD_TYPEN) if A.EINGANG.exists() else []
    unklar_alt = {n for n in (lies_json(KANAL / "hausmeister.json", {}).get("fotos_unklar") or []) if (A.EINGANG / str(n)).is_file()}
    bilder = [p for p in bilder if p.name not in unklar_alt]
    erg = {"gelesen": 0, "unklar": 0, "fehler": 0, "unklar_namen": sorted(unklar_alt)}
    if not bilder or not os.environ.get("ANTHROPIC_API_KEY"):
        return erg
    z = lies_json(KANAL / "zaehlerstaende.json", {})
    staende = z.get("staende") if isinstance(z.get("staende"), list) else []
    client = A.Anthropic()
    log = []
    for p in bilder:
        if stopp and stopp():
            break
        print(f"  Foto {p.name[:48]:<48} ", end="", flush=True)
        try:
            daten = p.read_bytes()
            when = foto_datum(p, daten)
            m = lies_zaehler(client, p, daten)
            if not m["zaehlerfoto"]:
                erg["unklar"] += 1
                erg["unklar_namen"].append(p.name)
                print("KEIN ZAEHLER")
                continue
            zdir = A.ARCHIV / "Privat" / "Energie_PV" / "Zaehlerfotos" / str(when.year)
            zdir.mkdir(parents=True, exist_ok=True)
            name = f"{when:%Y%m%d}_Zaehlerstand_{m['art'].capitalize()}" + (f"_{re.sub(r'[^A-Za-z0-9]', '', m['nummer'])}" if m["nummer"] else "") + p.suffix.lower()
            ziel = A.ensure_unique(zdir / name)
            shutil.move(str(p), str(ziel))
            staende.append(dict(m, id=hashlib.sha1((rel(ziel) + str(when)).encode("utf-8")).hexdigest()[:12],
                                datum=f"{when:%Y-%m-%d}", zeit=f"{when:%H:%M}", foto=rel(ziel), gelesen=jetzt(), status="neu"))
            erg["gelesen"] += 1
            log.append(f"[ZAEHLER] {p.name} -> {rel(ziel)} | {m['art']} {m['nummer'] or ''} {m['stand']} {m['einheit'] or ''} {m['obis'] or ''}")
            print(f"{m['art'].upper()} {m['stand']}")
        except Exception as ex:  # noqa: BLE001
            erg["fehler"] += 1
            log.append(f"[FEHLER] Foto {p.name}: {ex}")
            print("FEHLER")
    schreibe_json(KANAL / "zaehlerstaende.json", {"version": 1, "aktualisiert": jetzt(), "staende": staende[-500:]})
    if log:
        protokoll([f"--- Zaehlerfotos {jetzt()} ---"] + log)
    return erg


# =============================================================================
# Sicherung: ZIP der ganzen Ablage auf ein zweites Laufwerk (z. B. externe Platte)
# =============================================================================

def sicherung(einst: dict, alt: dict, stopp=None) -> dict:
    ziel = str(einst.get("sicherung_ziel") or "").strip()
    st = dict(alt or {})
    if not ziel:
        return st
    st["ziel"] = ziel
    tage = int(einst.get("sicherung_tage") or 7)
    behalten = int(einst.get("sicherung_behalten") or 10)
    zuletzt = st.get("zuletzt")
    if zuletzt and (datetime.now() - datetime.fromisoformat(zuletzt)).days < tage and not einst.get("sicherung_jetzt"):
        return st
    zdir = Path(ziel)
    try:
        zdir.resolve().relative_to(ROOT.resolve())
        st.update({"ok": False, "fehler": "Das Sicherungsziel liegt innerhalb der Ablage - bitte ein anderes Laufwerk waehlen.", "versucht": jetzt()})
        return st
    except ValueError:
        pass
    if not zdir.exists() and not (zdir.anchor and Path(zdir.anchor).exists()):
        st.update({"ok": False, "fehler": "Ziel nicht erreichbar (Laufwerk angeschlossen?)", "versucht": jetzt()})
        return st
    import zipfile
    zdir = zdir / "Cockpit-Sicherung"
    zdir.mkdir(parents=True, exist_ok=True)
    name = f"Ablage_{datetime.now():%Y-%m-%d}.zip"
    tmp = zdir / (name + ".tmp")
    gepackt = (".pdf", ".jpg", ".jpeg", ".png", ".webp", ".zip", ".heic")
    n = 0
    try:
        with zipfile.ZipFile(tmp, "w", allowZip64=True) as z:
            for p in ROOT.rglob("*"):
                if stopp and stopp():
                    raise Fehler("abgebrochen - Vorrang fuer einen Lauf aus dem Cockpit")
                if not p.is_file() or p.name.endswith(".tmp") or p.name in ("lauf.lock", "vorrang"):
                    continue
                teile = p.relative_to(ROOT).parts
                if teile[0] == "_Doppelt_pruefen" or "__pycache__" in teile:
                    continue  # Ablage fuer aussortierte Dubletten und Python-Zwischendateien nicht mitsichern
                if n % 50 == 0:
                    lebenszeichen()
                art = zipfile.ZIP_STORED if p.suffix.lower() in gepackt else zipfile.ZIP_DEFLATED
                z.write(p, p.relative_to(ROOT).as_posix(), compress_type=art)
                n += 1
        ziel_datei = zdir / name
        os.replace(tmp, ziel_datei)
        alte = sorted(zdir.glob("Ablage_*.zip"))
        for x in alte[:-behalten] if len(alte) > behalten else []:
            x.unlink()  # nur eigene, aeltere Sicherungen in Cockpit-Sicherung
        st.update({"ok": True, "fehler": None, "zuletzt": jetzt(), "datei": str(ziel_datei), "dateien": n,
                   "groesse_mb": round(ziel_datei.stat().st_size / 1e6, 1), "versucht": jetzt()})
        protokoll([f"--- Sicherung {jetzt()}: {n} Dateien -> {ziel_datei} ---"])
    except Exception as ex:  # noqa: BLE001
        try:
            tmp.unlink()
        except OSError:
            pass
        st.update({"ok": False, "fehler": f"{type(ex).__name__}: {ex}"[:200], "versucht": jetzt()})
    return st


# =============================================================================
# Hausmeister: automatischer Lauf ohne Fenster (Aufgabenplanung)
# =============================================================================

def stamm_sicher(meta: dict, idx: dict):
    """Brief eines bekannten Absenders ohne Rueckfrage ablegen? Nur wenn die letzten zwei Briefe dieses Absenders
    im Cockpit freigegeben wurden und genauso einsortiert sind (Bereich, Kategorie, Empfaenger, Steuer)."""
    ok, _ = gueltig(meta)
    if not ok or meta.get("kassenbon") or meta.get("doppelt") or meta.get("datum_unsicher"):
        return None
    if meta.get("konfidenz") != "hoch" or not meta.get("datum") or not meta.get("absender"):
        return None
    w = absender_wort(meta.get("absender"))
    if not w:
        return None
    frueher = [e for e in idx.values() if e.get("quelle") in ("cockpit", "hausmeister")
               and absender_wort(e.get("absender") or e.get("ki_absender")) == w]
    frueher.sort(key=lambda e: e.get("abgelegt") or "", reverse=True)
    if len(frueher) < 2:
        return None
    soll = (meta.get("archiv_bereich"), meta.get("archiv_kategorie"), meta.get("empfaenger"), bool(meta.get("steuerrelevant")),
            meta.get("stb_belegart") if meta.get("steuerrelevant") else None)
    for e in frueher[:2]:
        if (e.get("bereich"), e.get("kategorie"), e.get("empfaenger"), bool(e.get("st")), e.get("belegart") if e.get("st") else None) != soll:
            return None
    return frueher[0]


def stamm_ablegen(namen: set, stopp=None) -> list:
    """Nur Briefe, die dieser Lauf gerade analysiert hat - an Vorschlaegen, die man im Cockpit schon sieht
    (und vielleicht bearbeitet), aendert der Hausmeister nichts."""
    v = lade_vorschlaege()["dateien"]
    idx = lade_index()
    erg, log = [], []
    for name, d in list(v.items()):
        if stopp and stopp():
            break
        meta = d.get("meta")
        src = A.EINGANG / name
        if name not in namen or not meta or d.get("fehler") or not src.is_file():
            continue
        if d.get("groesse") != src.stat().st_size:
            continue
        vorbild = stamm_sicher(normalisiere(meta), idx) if not meta.get("doppelt") else None
        if not vorbild:
            continue
        try:
            e = lege_ab(normalisiere(meta), src, "hausmeister")
            idx[e["archiv"]] = e
            v.pop(name, None)
            erg.append({"datei": name, "ziel": e["archiv"], "id": e["id"], "titel": (e["absender"] + " - " + e["betreff"]).strip(" -"), "zeit": jetzt()})
            log.append(f"[AUTO] {name} -> {e['archiv']} (wie {vorbild.get('archiv')})")
        except Exception as ex:  # noqa: BLE001
            log.append(f"[FEHLER] {name}: {ex}")
    if erg:
        speichere_index(idx)
        speichere_vorschlaege(v)
    if log:
        protokoll([f"--- Hausmeister: Briefe bekannter Absender abgelegt {jetzt()} ---"] + log)
    return erg


SPERRE = None


def sperre_holen(cmd: str, warten=True, id_="") -> bool:
    """lauf.lock: nur ein Lauf gleichzeitig. Der Hausmeister wartet nicht; Laeufe aus dem Cockpit haben Vorrang
    (sie setzen 'vorrang', der Hausmeister beendet sich nach dem aktuellen Dokument)."""
    global SPERRE
    KANAL.mkdir(parents=True, exist_ok=True)
    lock = KANAL / "lauf.lock"
    start = time.time()
    while True:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"befehl": cmd, "pid": os.getpid(), "start": jetzt()}, f)
            SPERRE = lock
            if cmd != "hausmeister":
                try:
                    (KANAL / "vorrang").unlink()
                except FileNotFoundError:
                    pass
            return True
        except FileExistsError:
            try:
                alter = time.time() - lock.stat().st_mtime
                inhalt = lies_json(lock, {})
            except OSError:
                continue
            if alter > 20 * 60:  # verwaist (Hausmeister meldet sich alle paar Minuten) -> uebernehmen
                try:
                    lock.unlink()
                except OSError:
                    pass
                continue
            if cmd == "hausmeister" or not warten:
                return False
            if inhalt.get("befehl") == "hausmeister":
                (KANAL / "vorrang").write_text(jetzt(), encoding="utf-8")
                status(id_, cmd, "laeuft", "Warte, bis der automatische Lauf das aktuelle Dokument fertig hat ...")
            if time.time() - start > 15 * 60:
                return False
            time.sleep(2)


def sperre_frei():
    global SPERRE
    if SPERRE:
        try:
            SPERRE.unlink()
        except OSError:
            pass
        SPERRE = None


def lebenszeichen():
    if SPERRE:
        try:
            os.utime(SPERRE, None)
        except OSError:
            pass


def hat_vorrang() -> bool:
    lebenszeichen()
    return (KANAL / "vorrang").exists()


def cmd_hausmeister(id_):
    einst = lies_json(KANAL / "hausmeister_einst.json", {})
    alt = lies_json(KANAL / "hausmeister.json", {})
    hm = {"lauf": jetzt(), "version": 1, "fehler": []}
    try:
        z = zaehlerfotos(hat_vorrang)
        hm["zaehler_neu"] = z["gelesen"]
        hm["fotos_unklar"] = z["unklar_namen"]
    except Exception as ex:  # noqa: BLE001
        hm["fehler"].append(f"Zaehlerfotos: {ex}"[:200])
    neu_namen = set()
    if os.environ.get("ANTHROPIC_API_KEY") and A.EINGANG.exists() and not hat_vorrang():
        try:
            a = analyse_eingang("", hat_vorrang, neu_namen)
            hm["analyse"] = {k: a.get(k) for k in ("neu", "fehler", "dubletten", "kassenbons")}
        except Exception as ex:  # noqa: BLE001
            hm["fehler"].append(f"Analyse: {ex}"[:200])
    abgelegt = []
    if einst.get("auto_ablegen", True) and not hat_vorrang():
        try:
            abgelegt = stamm_ablegen(neu_namen, hat_vorrang)
        except Exception as ex:  # noqa: BLE001
            hm["fehler"].append(f"Ablegen: {ex}"[:200])
    hm["abgelegt"] = (abgelegt + (alt.get("abgelegt") or []))[:30]
    hm["abgelegt_neu"] = len(abgelegt)
    if not hat_vorrang():
        hm["sicherung"] = sicherung(einst, alt.get("sicherung"), hat_vorrang)
        if einst.get("sicherung_jetzt") and (hm["sicherung"] or {}).get("ok"):
            einst.pop("sicherung_jetzt", None)
            schreibe_json(KANAL / "hausmeister_einst.json", einst)
    else:
        hm["sicherung"] = alt.get("sicherung")
    hm["eingang"] = len(list(A.EINGANG.glob("*.pdf"))) if A.EINGANG.exists() else None
    z = lies_json(KANAL / "zaehlerstaende.json", {})
    hm["zaehler_offen"] = sum(1 for x in (z.get("staende") or []) if x.get("status") == "neu")
    hm["sicherung_ziel"] = bool(einst.get("sicherung_ziel"))
    schreibe_json(KANAL / "hausmeister.json", hm)
    return {"meldung": f"Hausmeister: {len(abgelegt)} abgelegt, {hm.get('zaehler_neu', 0)} Zaehlerfoto(s)", "ohne_warten": True}


def cmd_sicherung(id_):
    """'Jetzt sichern' aus dem Cockpit: wie beim Hausmeister, aber sofort und mit Konsolenfenster."""
    einst = lies_json(KANAL / "hausmeister_einst.json", {})
    if not str(einst.get("sicherung_ziel") or "").strip():
        raise Fehler("Kein Sicherungsziel eingetragen - im Cockpit unter Dokumente -> Einrichtung -> Hausmeister.")
    alt = lies_json(KANAL / "hausmeister.json", {})
    print(f"Sicherung der Ablage nach {einst['sicherung_ziel']} ...")
    status(id_, "sicherung", "laeuft", "Sicherung laeuft - je nach Groesse einige Minuten ...")
    s = sicherung(dict(einst, sicherung_jetzt=True), alt.get("sicherung"))
    alt["sicherung"] = s
    schreibe_json(KANAL / "hausmeister.json", alt)
    if not s.get("ok"):
        raise Fehler(s.get("fehler") or "Sicherung fehlgeschlagen")
    print(f"Fertig: {s['dateien']} Dateien, {s['groesse_mb']} MB -> {s['datei']}")
    return {"meldung": f"Sicherung fertig: {s['dateien']} Dateien, {s['groesse_mb']} MB", "sicherung": s}


def cmd_konsole(id_):
    A.main()  # klassische Ablage mit Rueckfragen im Konsolenfenster
    print("\nVerzeichnis fuer das Cockpit wird aktualisiert ...")
    erg = cmd_index(id_)
    erg["ohne_warten"] = True
    return erg


BEFEHLE = {"test": cmd_test, "analyse": cmd_analyse, "ablegen": cmd_ablegen, "index": cmd_index, "nachlesen": cmd_nachlesen, "konsole": cmd_konsole,
           "hausmeister": cmd_hausmeister, "sicherung": cmd_sicherung}


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


def hausmeister_main():
    """Ohne Fenster und ohne Rueckfragen (pythonw). Fehler landen in _cockpit/hausmeister.log."""
    global STILL
    STILL = True
    if not ROOT.exists():
        return
    if not sperre_holen("hausmeister"):
        return
    try:
        cmd_hausmeister("")
    except Exception as e:  # noqa: BLE001
        try:
            with open(KANAL / "hausmeister.log", "a", encoding="utf-8") as f:
                f.write(f"{jetzt()} {type(e).__name__}: {e}\n{traceback.format_exc()}\n")
        except OSError:
            pass
    finally:
        sperre_frei()
        try:
            (KANAL / "vorrang").unlink()
        except OSError:
            pass


def main():
    cmd, q = lies_aufruf(sys.argv)
    if cmd == "hausmeister":
        hausmeister_main()
        return
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
    gesperrt = False
    try:
        KANAL.mkdir(parents=True, exist_ok=True)
        status(id_, cmd, "laeuft", "gestartet", start=start)
        if cmd != "test":
            gesperrt = sperre_holen(cmd, True, id_)
            if not gesperrt:
                raise Fehler("Ein anderer Lauf ist noch aktiv - bitte gleich noch einmal versuchen.")
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
    finally:
        if gesperrt:
            sperre_frei()


if __name__ == "__main__":
    main()
