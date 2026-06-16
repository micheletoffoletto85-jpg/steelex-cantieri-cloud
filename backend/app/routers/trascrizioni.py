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

# Prompt unico che fa tutto: capisce il parlato, traduce, e produce il rapportino
PROMPT_RAPPORTINO = """Sei un traduttore e trascrittore per cantieri edili.

Ricevi la trascrizione grezza di un audio registrato da un operaio che parla in {lingua_nome}.
La trascrizione può essere disordinata, ripetitiva o spezzata — è parlato spontaneo.

Il tuo compito è scrivere una nota di rapportino in italiano chiaro e semplice.

Regole:
1. Traduci e riassumi quello che l'operaio ha detto — niente di più, niente di meno
2. Usa parole semplici e dirette, come le userebbe l'operaio stesso in italiano
3. NON usare termini tecnici specialistici se l'operaio non li ha usati
4. NON inventare dettagli, NON interpretare oltre quello che è stato detto
5. Se qualcosa non si capisce bene, riportalo in modo generico senza indovinare
6. Elimina le ripetizioni e le parole di riempimento
7. Niente titoli, elenchi, markdown — solo testo scorrevole
8. Lunghezza: proporzionale a quello che ha detto l'operaio, né più corta né più lunga

Trascrizione originale ({lingua_nome}):
{testo_originale}

Nota rapportino in italiano:"""


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

        # Step 2: Claude capisce, traduce e genera il rapportino in un unico step
        testo_italiano = testo_originale  # fallback se Claude non è configurato
        n_parole = len(testo_originale.split())

        if settings.ANTHROPIC_API_KEY and n_parole >= 5:
            import anthropic
            claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

            prompt = PROMPT_RAPPORTINO.format(
                lingua_nome=lingua_nome,
                testo_originale=testo_originale,
            )

            msg = claude.messages.create(
                model="claude-sonnet-4-6",  # Sonnet per qualità ottimale su funzione critica
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            testo_italiano = msg.content[0].text.strip()

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
