"""Import delle piante esportate dall'app del metro laser (HOTO / Mi Home).

L'app del metro laser esporta un'immagine con il contorno del vano e la
lunghezza di ogni lato scritta sopra. Qui:
  1. l'IA (Claude, visione) legge l'immagine → vertici in pixel + lunghezze;
  2. la geometria ricostruisce la figura usando le LUNGHEZZE misurate (non i
     pixel): i lati quasi orizzontali/verticali vengono raddrizzati a 90°, e
     se restano due lati obliqui la figura si chiude in modo esatto
     (intersezione di due cerchi). Altrimenti si usa la direzione letta dai
     pixel e si compensa l'errore di chiusura (metodo di Bowditch);
  3. si calcolano perimetro e area (formula di Gauss / shoelace).
"""
import base64
import io
import json
import logging
import math
from typing import List, Optional

log = logging.getLogger(__name__)

TOLL_ORTO_GRADI = 6.0      # entro questa tolleranza un lato è considerato a 90°
SCARTO_AVVISO_PCT = 5.0    # oltre questo scarto (area misure vs area disegno) avvisiamo


# ─── GEOMETRIA ───────────────────────────────────────────────────────────────

def _shoelace(pts) -> float:
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def _diff_ang(a: float, b: float) -> float:
    d = (a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def _snap_orto(theta: float) -> Optional[float]:
    """Se l'angolo è entro la tolleranza da un multiplo di 90°, lo raddrizza."""
    q = round(theta / (math.pi / 2)) * (math.pi / 2)
    return q if _diff_ang(theta, q) <= math.radians(TOLL_ORTO_GRADI) else None


def ricostruisci(vertici_px: List[List[float]], lunghezze: List[Optional[float]], chiusa: bool = True) -> dict:
    """Ricostruisce la figura in metri.

    vertici_px: [[x, y], ...] in pixel (y verso il basso), nell'ordine del contorno.
    lunghezze:  lunghezza del lato i (dal vertice i al successivo) in metri, o None
                se il lato non ha quota. Per una figura chiusa len == len(vertici).
    """
    n_v = len(vertici_px)
    n_l = n_v if chiusa else n_v - 1
    if n_v < 2 or len(lunghezze) < n_l:
        raise ValueError("Figura non valida: troppo pochi vertici o lati")
    lunghezze = list(lunghezze[:n_l])

    # Direzioni dai pixel (y ribaltata: in alto = positivo) e lunghezze in pixel
    theta_px, len_px = [], []
    for i in range(n_l):
        x1, y1 = vertici_px[i]
        x2, y2 = vertici_px[(i + 1) % n_v]
        theta_px.append(math.atan2(-(y2 - y1), x2 - x1))
        len_px.append(math.hypot(x2 - x1, y2 - y1))

    # Scala px→m dai lati quotati (mediana: robusta a un'eventuale lettura sbagliata)
    rapporti = sorted(l / p for l, p in zip(lunghezze, len_px) if l and p > 0)
    if not rapporti:
        raise ValueError("Nessuna quota leggibile nell'immagine")
    scala = rapporti[len(rapporti) // 2]
    quote_mancanti = [i for i, l in enumerate(lunghezze) if not l]
    L = [l if l else len_px[i] * scala for i, l in enumerate(lunghezze)]

    theta = list(theta_px)
    ortogonali = [False] * n_l
    for i in range(n_l):
        s = _snap_orto(theta_px[i])
        if s is not None:
            theta[i] = s
            ortogonali[i] = True

    metodo = "aperta"
    if chiusa:
        liberi = [i for i in range(n_l) if not ortogonali[i]]
        risolto = False
        # Due lati obliqui con quota misurata: chiusura esatta
        if len(liberi) == 2 and not quote_mancanti:
            a, b = liberi
            cx = -sum(L[i] * math.cos(theta[i]) for i in range(n_l) if ortogonali[i])
            cy = -sum(L[i] * math.sin(theta[i]) for i in range(n_l) if ortogonali[i])
            d = math.hypot(cx, cy)
            ra, rb = L[a], L[b]
            if d > 1e-9 and abs(ra - rb) <= d <= ra + rb:
                # punto P = ra·u_a sull'intersezione dei cerchi (0, ra) e (C, rb)
                k = (ra * ra - rb * rb + d * d) / (2 * d)
                h = math.sqrt(max(ra * ra - k * k, 0.0))
                mx, my = k * cx / d, k * cy / d
                migliore = None
                for sgn in (1, -1):
                    px, py = mx - sgn * h * cy / d, my + sgn * h * cx / d
                    ta = math.atan2(py, px)
                    tb = math.atan2(cy - py, cx - px)
                    err = _diff_ang(ta, theta_px[a]) + _diff_ang(tb, theta_px[b])
                    if migliore is None or err < migliore[0]:
                        migliore = (err, ta, tb)
                # accettiamo solo se coerente col disegno (entro ~25° in totale)
                if migliore[0] < math.radians(25):
                    theta[a], theta[b] = migliore[1], migliore[2]
                    metodo = "chiusura esatta"
                    risolto = True
        if not risolto:
            metodo = "compensazione"

    # Coordinate dei vertici
    pts = [(0.0, 0.0)]
    for i in range(n_l if not chiusa else n_l - 1):
        x, y = pts[-1]
        pts.append((x + L[i] * math.cos(theta[i]), y + L[i] * math.sin(theta[i])))

    errore_chiusura = 0.0
    if chiusa:
        # vettore di chiusura residuo → Bowditch (proporzionale alla lunghezza)
        xl, yl = pts[-1]
        ex = xl + L[-1] * math.cos(theta[-1])
        ey = yl + L[-1] * math.sin(theta[-1])
        errore_chiusura = math.hypot(ex, ey)
        tot = sum(L)
        cum, corr = 0.0, [(0.0, 0.0)]
        for i in range(n_l - 1):
            cum += L[i]
            f = cum / tot
            corr.append((pts[i + 1][0] - ex * f, pts[i + 1][1] - ey * f))
        pts = corr

    perimetro = sum(L) if chiusa else None
    lunghezza_totale = sum(L)
    area = _shoelace(pts) if chiusa and n_v >= 3 else None

    # Controllo incrociato: area misurata dal disegno (pixel × scala²)
    area_disegno = _shoelace(vertici_px) * scala * scala if chiusa and n_v >= 3 else None
    scarto_pct = (abs(area - area_disegno) / area_disegno * 100
                  if area and area_disegno else None)

    avvisi = []
    if quote_mancanti:
        avvisi.append(f"{len(quote_mancanti)} lato/i senza quota: lunghezza stimata dal disegno")
    if chiusa and errore_chiusura > 0.02:
        avvisi.append(f"Le misure non chiudono la figura di {errore_chiusura * 100:.0f} cm: errore distribuito sui lati")
    if scarto_pct is not None and scarto_pct > SCARTO_AVVISO_PCT:
        avvisi.append(f"L'area differisce del {scarto_pct:.0f}% dal disegno: controlla le quote")

    # Coordinate per l'anteprima: origine in alto a sinistra, y verso il basso
    minx = min(p[0] for p in pts)
    maxy = max(p[1] for p in pts)
    punti = [[round(x - minx, 4), round(maxy - y, 4)] for x, y in pts]

    return {
        "chiusa": chiusa,
        "lati": [{"lunghezza": round(L[i], 3), "quota_letta": bool(lunghezze[i]),
                  "ortogonale": ortogonali[i]} for i in range(n_l)],
        "punti": punti,
        "perimetro": round(perimetro, 3) if perimetro is not None else None,
        "lunghezza_totale": round(lunghezza_totale, 3),
        "area": round(area, 3) if area is not None else None,
        "area_disegno": round(area_disegno, 3) if area_disegno is not None else None,
        "scarto_pct": round(scarto_pct, 1) if scarto_pct is not None else None,
        "errore_chiusura": round(errore_chiusura, 4),
        "metodo": metodo,
        "avvisi": avvisi,
    }


# ─── LETTURA IMMAGINE CON L'IA ───────────────────────────────────────────────

_SCHEMA = {
    "type": "object",
    "properties": {
        "trovata": {"type": "boolean"},
        "chiusa": {"type": "boolean"},
        "vertici": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                "required": ["x", "y"],
                "additionalProperties": False,
            },
        },
        "lunghezze": {"type": "array", "items": {"type": ["number", "null"]}},
        "note": {"type": "string"},
    },
    "required": ["trovata", "chiusa", "vertici", "lunghezze", "note"],
    "additionalProperties": False,
}


def _prompt(w: int, h: int) -> str:
    return f"""L'immagine ({w}×{h} pixel) è lo schizzo esportato dall'app di un metro laser:
un contorno di linee bianche tra vertici (cerchietti), con la lunghezza di ogni lato scritta in un'etichetta sul lato.

Estrai la figura:
- "vertici": coordinate in pixel (origine in alto a sinistra, x verso destra, y verso il basso) di ogni vertice,
  nell'ordine in cui si percorre il contorno.
- "lunghezze": la quota del lato che va dal vertice i al vertice i+1 (e, se la figura è chiusa, dall'ultimo al primo),
  in METRI come numero (es. "2.220" → 2.22). Se un lato non ha etichetta metti null.
  Se le quote sono in piedi/pollici convertile in metri.
- "chiusa": true se il contorno racchiude un'area (l'ultimo vertice si ricollega al primo).
- Ignora i trattini corti senza quota che sporgono da un vertice (residui di misura): non sono lati.
- Le etichette possono essere ruotate: leggile con attenzione, cifra per cifra.
- "trovata": false se l'immagine non è uno schizzo di misure.
- "note": eventuali dubbi di lettura, altrimenti stringa vuota.
Rispondi solo con il JSON."""


def _prepara_immagine(dati: bytes):
    """Ridimensiona (lato lungo ≤ 1568 px, come fa l'API) e restituisce jpeg base64 + dimensioni."""
    from PIL import Image
    img = Image.open(io.BytesIO(dati))
    img = img.convert("RGB")
    lato = max(img.size)
    if lato > 1568:
        f = 1568 / lato
        img = img.resize((round(img.width * f), round(img.height * f)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return base64.standard_b64encode(buf.getvalue()).decode(), img.width, img.height


def _estrai_json(testo: str) -> dict:
    testo = testo.strip()
    if testo.startswith("```"):
        testo = testo.strip("`")
        testo = testo[testo.find("{"):]
    return json.loads(testo[testo.find("{"): testo.rfind("}") + 1])


# Modelli in ordine di preferenza: tutti con output strutturato; l'ultimo senza
# schema come rete di sicurezza. Se un modello è sovraccarico o risponde in un
# formato inatteso si passa al successivo invece di fallire.
_MODELLI = ("claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-4-6")


def _num(x) -> Optional[float]:
    """Numero da risposta IA: accetta 1.5, "1,536", "2.220 m"; None se assente/0."""
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x) if x > 0 else None
    try:
        v = float(str(x).replace(",", ".").replace("m", "").strip())
        return v if v > 0 else None
    except ValueError:
        return None


def _punto(p) -> List[float]:
    """Vertice da risposta IA: {"x":..,"y":..} oppure [x, y]."""
    if isinstance(p, dict):
        return [float(p["x"]), float(p["y"])]
    return [float(p[0]), float(p[1])]


def _immagine_valida(dati: bytes):
    try:
        return _prepara_immagine(dati)
    except Exception as e:  # noqa: BLE001 — HEIC, file corrotto, non immagine
        raise ValueError("Formato immagine non leggibile: usa uno screenshot o una foto JPG/PNG") from e


def _chiedi_ia(api_key: str, b64: str, prompt: str, schema: dict, max_tokens: int, componi):
    """Chiede la lettura ai modelli in ordine; `componi` trasforma il JSON letto nel
    risultato e, se il formato non torna, fa passare al modello successivo.
    Un ValueError di `componi` (immagine senza misure) è una risposta valida."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key, timeout=120)
    contenuto = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
        {"type": "text", "text": prompt},
    ]
    ultimo_errore = None
    for i, modello in enumerate(_MODELLI):
        opz = dict(model=modello, max_tokens=max_tokens)
        if i < len(_MODELLI) - 1:
            opz["output_config"] = {"format": {"type": "json_schema", "schema": schema}}
        try:
            msg = client.messages.create(messages=[{"role": "user", "content": contenuto}], **opz)
            if getattr(msg, "stop_reason", None) == "refusal":
                ultimo_errore = f"{modello}: rifiuto"
                continue
            letto = _estrai_json(next(b.text for b in msg.content if b.type == "text"))
            return componi(letto)
        except ValueError as e:
            if isinstance(e, json.JSONDecodeError):
                ultimo_errore = e
                log.warning("Lettura laser %s: JSON non valido (%s)", modello, e)
                continue
            raise
        except Exception as e:  # noqa: BLE001 — proviamo il modello successivo
            ultimo_errore = e
            log.warning("Lettura laser %s fallita: %r", modello, e)
    raise RuntimeError(f"Lettura IA non riuscita: {ultimo_errore}")


def leggi_pianta(dati: bytes, api_key: str) -> dict:
    """Legge l'immagine con Claude e restituisce la figura ricostruita."""
    b64, w, h = _immagine_valida(dati)
    return _chiedi_ia(api_key, b64, _prompt(w, h), _SCHEMA, 4000, _componi_pianta)


def _componi_pianta(letto: dict) -> dict:
    if not letto.get("trovata") or len(letto.get("vertici") or []) < 2:
        raise ValueError("Nell'immagine non ho trovato uno schizzo di misure leggibile")
    vertici = [_punto(v) for v in letto["vertici"]]
    chiusa = bool(letto.get("chiusa")) and len(vertici) >= 3
    lunghezze = [_num(x) for x in (letto.get("lunghezze") or [])]
    n_l = len(vertici) if chiusa else len(vertici) - 1
    lunghezze = (lunghezze + [None] * n_l)[:n_l]

    out = ricostruisci(vertici, lunghezze, chiusa)
    if letto.get("note"):
        out["avvisi"].append(f"IA: {letto['note']}")
    return out
