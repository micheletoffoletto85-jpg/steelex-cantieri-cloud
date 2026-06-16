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
PROMPT_RAPPORTINO = """Sei un assistente esperto di cantieri edili italiani con anni di esperienza nel settore delle costruzioni in cemento armato, acciaio e LSF (Light Steel Frame).

Ricevi la trascrizione grezza di un audio registrato da un operaio o artigiano di cantiere che parla in {lingua_nome}.
La trascrizione è generata automaticamente e può contenere:
- Frasi spezzate, incomplete o ripetute
- Parole di riempimento (ehm, allora, tipo, cioè, quindi...)
- Gergo e termini tecnici detti in modo informale o abbreviato
- Errori fonetici tipici della trascrizione automatica
- Costruzioni grammaticali del parlato spontaneo

Il tuo compito è produrre una NOTA DI RAPPORTINO DI CANTIERE in italiano professionale.

GLOSSARIO TECNICO — usa sempre questi termini italiani corretti quando l'operaio descrive queste operazioni:
- Scapitozzatura / scapitozzare: demolizione meccanica della testa del pilastro in c.a. per rimuovere il calcestruzzo poroso e portare a nudo i ferri di armatura prima del getto successivo
- Casseratura / cassero: struttura provvisoria in legno o metallo che contiene il calcestruzzo durante il getto
- Disarmo / disarmare: rimozione dei casseri dopo l'indurimento del calcestruzzo
- Getto: operazione di colata del calcestruzzo
- Pilastro / colonna: elemento verticale portante in c.a.
- Trave / putrella: elemento orizzontale portante (IPE, HEA, HEB per acciaio)
- Solaio: struttura orizzontale di piano
- Cerchiatura: fasciatura di rinforzo attorno a un elemento strutturale
- Staffatura: posa delle staffe (ferri ad U) attorno alle armature longitudinali
- Intonaco / intonacatura: rivestimento di malta su pareti
- Rasatura: strato finale liscio sull'intonaco
- Massetto: strato di calcestruzzo magro su solaio, base per pavimento
- Impermeabilizzazione: applicazione di guaina o membrane impermeabili
- Posa dei serramenti / infissi: installazione di porte e finestre
- Tassellatura / tassello: fissaggio meccanico a espansione
- Ponteggio: struttura metallica esterna per lavori in quota
- LSF / Light Steel Frame: sistema costruttivo in acciaio leggero (montanti, traversi, guide)
- Montante: profilo verticale in LSF
- Guida / traverso: profilo orizzontale in LSF
- Pannello OSB / cartongesso: rivestimento su struttura LSF
- Coibentazione / isolamento: posa di lana di roccia, polistirene o simili

Regole FONDAMENTALI:
1. CAPISCI il significato reale — non tradurre letteralmente parola per parola, ma comprendi COSA vuole comunicare l'operaio
2. RICOSTRUISCI il senso anche se le frasi sono confuse o incomplete
3. USA i termini del glossario quando riconosci l'operazione descritta, anche se l'operaio usa parole generiche o dialettali
4. STRUTTURA logica: prima le lavorazioni eseguite, poi eventuali problemi o blocchi, poi materiali usati o necessari
5. SINTESI: elimina tutto il ridondante, mantieni solo i fatti utili
6. NON aggiungere titoli, elenchi puntati, markdown o commenti
7. NON inventare informazioni che non ci sono nell'audio
8. Scrivi come una nota professionale che un capo cantiere scriverebbe nel registro giornaliero

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
