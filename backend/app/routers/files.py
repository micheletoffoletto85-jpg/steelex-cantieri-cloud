"""
Endpoint autenticato per servire i file locali (/uploads/*).
Sostituisce il mount StaticFiles pubblico — solo utenti loggati possono scaricare.
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, RedirectResponse
from app.auth import get_current_user
from app.config import settings
from app.storage import leggi_file

router = APIRouter(tags=["Files"])

@router.get("/uploads/{percorso:path}")
def scarica_file(percorso: str, _=Depends(get_current_user)):
    # Sanifica il percorso per evitare path traversal
    percorso_pulito = os.path.normpath(percorso).lstrip("/\\").replace("..", "")
    percorso_assoluto = os.path.join(settings.UPLOAD_DIR, percorso_pulito)

    # Impedisce di uscire dalla cartella upload
    upload_dir = os.path.realpath(settings.UPLOAD_DIR)
    if not os.path.realpath(percorso_assoluto).startswith(upload_dir + os.sep):
        raise HTTPException(403, "Accesso negato")

    if not os.path.isfile(percorso_assoluto):
        raise HTTPException(404, "File non trovato")

    try:
        contenuto, content_type = leggi_file(percorso_assoluto)
    except Exception:
        raise HTTPException(404, "File non trovato")

    return Response(content=contenuto, media_type=content_type)


@router.get("/api/v1/files/anteprima")
def anteprima(u: str):
    """Miniatura compressa di una foto del bucket (la crea al primo accesso).
    Senza login: i tag <img> non mandano il token, e accetta solo URL del nostro
    bucket R2 — che sono già pubblici — quindi non espone niente di nuovo."""
    from app.anteprime import url_anteprima, chiave_da_url
    if not chiave_da_url(u):
        # niente redirect verso indirizzi che non sono foto nostre
        raise HTTPException(404, "Anteprima non disponibile")
    dest = url_anteprima(u)
    # La miniatura di un URL non cambia mai: il browser può ricordarsi il redirect
    return RedirectResponse(dest, status_code=302, headers={"Cache-Control": "public, max-age=604800"})
