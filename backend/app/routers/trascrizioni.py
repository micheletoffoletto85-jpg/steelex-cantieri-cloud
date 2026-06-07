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

@router.post("")
async def trascrivi_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key non configurata. Aggiungila su Railway.")

    # Salva audio in file temporaneo
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # Trascrivi con Whisper (rileva lingua automaticamente)
        with open(tmp_path, "rb") as audio_file:
            risposta = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
            )

        testo_originale = risposta.text.strip()
        lingua_rilevata = getattr(risposta, "language", "it") or "it"
        lingua_nome = LINGUE_SUPPORTATE.get(lingua_rilevata, lingua_rilevata)

        # Se Whisper non ha trascritto nulla, l'audio era silenzio o non udibile
        if not testo_originale:
            raise HTTPException(status_code=422, detail="Non ho sentito nulla. Prova ad avvicinarti al microfono e parla più chiaramente.")

        # Traduci + riorganizza con Claude (solo se il testo è abbastanza lungo)
        testo_italiano = testo_originale
        SOGLIA_CLAUDE = 8  # parole minime per attivare la riorganizzazione

        if settings.ANTHROPIC_API_KEY:
            import anthropic
            claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

            # Step 1: traduzione (solo se non è già italiano)
            if lingua_rilevata != "it":
                msg = claude.messages.create(
                    model="claude-haiku-4-5",
                    max_tokens=1024,
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Sei un assistente per cantieri edili.\n"
                            f"Traduci il seguente testo da {lingua_nome} a italiano.\n"
                            f"Mantieni il senso tecnico. Rispondi solo con la traduzione, senza aggiunte.\n\n"
                            f"Testo: {testo_originale}"
                        )
                    }]
                )
                testo_italiano = msg.content[0].text.strip()

            # Step 2: riorganizza solo se il testo è abbastanza lungo
            n_parole = len(testo_italiano.split())
            if n_parole >= SOGLIA_CLAUDE:
                msg2 = claude.messages.create(
                    model="claude-haiku-4-5",
                    max_tokens=1024,
                    messages=[{
                        "role": "user",
                        "content": (
                            "Sei un assistente esperto di cantieri edili.\n"
                            "Ricevi una nota vocale trascritta da un operaio o artigiano di cantiere.\n"
                            "Il testo può essere disordinato, ripetitivo o parlato in modo informale.\n\n"
                            "Il tuo compito:\n"
                            "1. Riorganizza il contenuto in modo chiaro e logico\n"
                            "2. Elimina ripetizioni e parole di riempimento\n"
                            "3. Usa un linguaggio tecnico ma diretto, come si usa in cantiere\n"
                            "4. Se ci sono più argomenti distinti, separali con un punto o a capo\n"
                            "5. NON aggiungere titoli, intestazioni, bullet point o markdown\n"
                            "6. NON aggiungere informazioni che non ci sono\n"
                            "7. Rispondi SOLO con il testo riorganizzato, niente altro\n\n"
                            f"Testo da riorganizzare:\n{testo_italiano}"
                        )
                    }]
                )
                testo_italiano = msg2.content[0].text.strip()

        return {
            "testo_originale": testo_originale,
            "lingua_rilevata": lingua_rilevata,
            "lingua_nome": lingua_nome,
            "testo_italiano": testo_italiano,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore trascrizione: {str(e)}")
    finally:
        os.unlink(tmp_path)
