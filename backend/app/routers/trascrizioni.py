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

GLOSSARIO TECNICO DI RIFERIMENTO — usa questi termini SOLO se sei certo che l'operaio stia descrivendo esattamente quell'operazione. NON applicare termini strutturali se il contesto è lavori di finitura, e viceversa.

Lavori strutturali / cemento armato:
- Scapitozzatura: demolizione della testa del pilastro in c.a. per esporre i ferri. Solo se si parla esplicitamente di pilastri/colonne in calcestruzzo.
- Casseratura / disarmo: montaggio e rimozione dei casseri per il getto
- Getto: colata del calcestruzzo
- Staffatura: posa dei ferri ad U attorno alle armature longitudinali
- Cerchiatura: rinforzo esterno attorno a un elemento strutturale

Lavori di finitura (più comuni nei cantieri LSF):
- Intonacatura / intonaco: applicazione di malta su pareti
- Rasatura / rasante: strato liscio finale sull'intonaco, prima della pittura
- Stuccatura: riempimento di fessure o giunti
- Cartucciatura: sigillatura con silicone o stucco degli stipiti/infissi
- Tinteggiatura / pitturazione: applicazione di pittura su pareti
- Posa dei serramenti / infissi: installazione di porte e finestre
- Tassellatura: fissaggio meccanico a espansione su muratura o struttura
- Massetto: strato di calcestruzzo magro su solaio come base per il pavimento
- Posa del pavimento / parquet / piastrelle: rivestimento del solaio
- Impermeabilizzazione / guaina: membrana impermeabile su terrazze o bagni
- Controparete / cartongesso: parete interna su struttura metallica leggera

LSF — Light Steel Frame:
- Montante: profilo verticale in acciaio leggero
- Guida: profilo orizzontale (a pavimento o soffitto) in LSF
- Coibentazione / isolamento: posa di lana di roccia, polistirene, ecc.
- Pannello OSB: rivestimento strutturale su telaio LSF

Regole FONDAMENTALI:
1. CAPISCI il contesto dell'operazione prima di scegliere la terminologia — finitura, struttura o LSF sono mondi diversi
2. Se non sei sicuro del termine tecnico esatto, usa una descrizione chiara in italiano semplice — è meglio una descrizione generica corretta che un termine tecnico sbagliato
3. RICOSTRUISCI il senso anche se le frasi sono confuse o incomplete
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
