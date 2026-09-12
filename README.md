# Dinner Scout

Hackathon prototype using saved supermarket materials and Cookpad recipes.

## Frontend demo

```sh
npm ci
npm run dev
```

Frontend uses an explicitly labeled mock planning service. Real API integration remains separate; demo meals and prices are not verified store data.

## Real saved-material backend

```sh
python3 -m venv .venv
.venv/bin/pip install -r validation/requirements.txt
cp validation/.env.example .env
# Fill credentials locally.
.venv/bin/python backend/server.py
```

API: http://127.0.0.1:8787. Saved materials are parsed in Daytona and normalized for real Neo4j AuraDB candidate searches. Current samples yield three candidates and explicit missing-data reasons, not a complete seven-day plan.

Nosana GPU allocation succeeded, but successful inference is still unverified. No fabricated inference fallback is used.

- [API contract](backend/API_CONTRACT.md)
- [Material import](materials/README.md)
- [Nosana usage](validation/nosana/README.md)
- [Implementation handoff](IMPLEMENTATION_HANDOFF.md)
- [Frontend handoff](docs/FRONTEND_HANDOFF.md)

## Tests

```sh
PYTHONPATH=validation .venv/bin/python -m unittest discover -s validation/tests
.venv/bin/python -m unittest discover -s backend/tests
npm test
```

Do not commit .env. Real provider executions consume credits; stop resources after validation.
