# Configurazione test: variabili d'ambiente fittizie per importare l'app senza DB reale
import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
