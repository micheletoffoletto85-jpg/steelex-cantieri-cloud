# Nomi file con caratteri non latin-1 (es. "—" nel nome cantiere) non devono rompere i download
import io
from fastapi.responses import StreamingResponse
from app.download import disposizione, nome_sicuro


def test_nome_cantiere_con_lineette():
    h = disposizione("preventivo_003/2026_Nicola Moro — Via dello Sport 27 – Thiene.pdf")
    StreamingResponse(io.BytesIO(b""), headers={"Content-Disposition": h})   # non solleva
    assert h.startswith('attachment; filename="preventivo_003-2026_Nicola Moro - Via dello Sport 27 - Thiene.pdf"')
    assert "filename*=UTF-8''" in h


def test_nome_sicuro():
    assert nome_sicuro('a"b\c/d.pdf') == "a_b_c_d.pdf"
    assert nome_sicuro("") == "file"
