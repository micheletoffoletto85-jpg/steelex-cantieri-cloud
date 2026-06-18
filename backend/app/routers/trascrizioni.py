from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import os, tempfile
from app.database import get_db
from app.models.utente import Utente
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/trascrizioni", tags=["Trascrizioni AI"])

LINGUE_SUPPORTATE = {
    "it": "italiano", "en": "inglese", "de": "tedesco",
    "fr": "francese", "es": "spagnolo", "ro": "rumeno",
    "pl": "polacco", "uk": "ucraino", "ar": "arabo",
}

# Step A: riordina nella lingua originale
PROMPT_RIORDINA = """Ricevi la trascrizione grezza di un audio registrato da un operaio di cantiere che parla in {lingua_nome}.
È parlato spontaneo: può essere disordinato, ripetitivo, spezzato.

Riscrivi il contenuto nella stessa lingua {lingua_nome}, in modo chiaro e ordinato:
- Elimina ripetizioni e parole di riempimento
- Metti in ordine logico: prima cosa ha fatto, poi eventuali problemi, poi materiali
- Usa le stesse parole semplici che avrebbe usato lui
- NON tradurre, NON aggiungere dettagli, NON inventare nulla
- Solo testo scorrevole, niente elenchi o titoli

Trascrizione grezza:
{testo_originale}

Testo ordinato in {lingua_nome}:"""

# Step B: traduce in italiano il testo già ordinato
PROMPT_TRADUCI = """Traduci in italiano questo testo scritto in {lingua_nome} da un operaio di cantiere.

Regole:
- Traduci fedelmente, senza aggiungere né togliere nulla
- Usa parole semplici e dirette, come le userebbe l'operaio in italiano
- Solo testo scorrevole, niente titoli o elenchi

Testo in {lingua_nome}:
{testo_ordinato}

Traduzione in italiano:"""


@router.post("")
async def trascrivi_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key non configurata. Aggiungila su Railway.")

    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # Step 1: Whisper trascrive e rileva la lingua
        with open(tmp_path, "rb") as audio_file:
            risposta = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
            )

        testo_originale = risposta.text.strip()
        lingua_rilevata = getattr(risposta, "language", "it") or "it"
        lingua_nome = LINGUE_SUPPORTATE.get(lingua_rilevata, lingua_rilevata)

        if not testo_originale:
            raise HTTPException(
                status_code=422,
                detail="Non ho sentito nulla. Prova ad avvicinarti al microfono e parla più chiaramente."
            )

        # Step 2a: Claude riordina nella lingua originale
        # Step 2b: Claude traduce in italiano il testo già ordinato
        testo_italiano = testo_originale  # fallback se Claude non è configurato
        n_parole = len(testo_originale.split())

        if settings.ANTHROPIC_API_KEY and n_parole >= 5:
            import anthropic
            claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

            if lingua_rilevata == "it":
                # Solo riordina, nessuna traduzione
                msg = claude.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": PROMPT_RIORDINA.format(
                        lingua_nome=lingua_nome, testo_originale=testo_originale
                    )}]
                )
                testo_italiano = msg.content[0].text.strip()
            else:
                # Step A: riordina nella lingua originale (Haiku — veloce)
                msg_a = claude.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": PROMPT_RIORDINA.format(
                        lingua_nome=lingua_nome, testo_originale=testo_originale
                    )}]
                )
                testo_ordinato = msg_a.content[0].text.strip()

                # Step B: traduce in italiano (Sonnet — qualità)
                msg_b = claude.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1024,
                    messages=[{"role": "user", "content": PROMPT_TRADUCI.format(
                        lingua_nome=lingua_nome, testo_ordinato=testo_ordinato
                    )}]
                )
                testo_italiano = msg_b.content[0].text.strip()

        return {
            "testo_originale": testo_originale,
            "lingua_rilevata": lingua_rilevata,
            "lingua_nome": lingua_nome,
            "testo_italiano": testo_italiano,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore trascrizione: {str(e)}")
    finally:
        os.unlink(tmp_path)
